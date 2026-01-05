import chalk from 'chalk';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pAll from 'p-all';
import pRetry from 'p-retry';
import signale from 'signale';

import { getBotCredentials, getGameVersion } from './config.js';
import { OUTPUT_PATH } from './constants.js';
import { HuijiApiClient } from './huiji.js';

const API_URL = 'https://ff14.huijiwiki.com/api.php';
const BATCH_SIZE = 500;
const CONCURRENCY = 5;
const VERSION = getGameVersion();
const VERSION_DIR = path.join(OUTPUT_PATH, VERSION);

const sha1Hash = (data: Buffer) => crypto.createHash('sha1').update(data).digest('hex');

export async function uploadFiles() {
    if (VERSION == null) {
        signale.error('无法获取游戏版本信息，请检查客户端是否完整');
        return;
    }
    if (!fs.existsSync(VERSION_DIR)) {
        signale.error(`当前游戏版本 ${VERSION} 的数据尚未生成，请先执行生成操作`);
        return;
    }

    try {
        const credentials = getBotCredentials();
        const client = new HuijiApiClient(API_URL, credentials.apiKey);
        await client.login(credentials.user, credentials.password);

        const sha1: Record<string, string> = {};
        const files = fs
            .readdirSync(path.join(VERSION_DIR))
            .filter(file => file.endsWith('.webp'))
            .map(file => path.join(VERSION_DIR, file));
        for (let i = 0; i < files.length; i += BATCH_SIZE) {
            const imageInfo = await client.queryImageInfo(
                files.slice(i, i + BATCH_SIZE).map(f => `File:${path.basename(f)}`),
                'sha1'
            );
            for (const page of imageInfo.pages) {
                if (page.missing === true) continue;
                const normalized = imageInfo.normalized.find((n: any) => n.to === page.title);
                if (normalized != null) sha1[normalized.from.replace(/^File:/, '')] = page.imageinfo[0].sha1;
            }
        }
        await pAll(
            files.map(file => () => {
                const fileName = path.basename(file);
                return pRetry(
                    async () => {
                        if (sha1[fileName] === sha1Hash(await readFile(file))) {
                            signale.note(`${chalk.italic.yellowBright(fileName)} 没有更改，跳过上传`);
                            return;
                        }
                        await client.upload(fileName, (await readFile(file)).buffer, 'image/webp', `更新 ${VERSION} 版本的图片数据`, '本文件为自动生成，请勿手动修改');
                        signale.success(`${chalk.italic.yellowBright(fileName)} 已上传`);
                    },
                    {
                        retries: 5,
                        onFailedAttempt: ({ error, attemptNumber }) => {
                            signale.error(error);
                            signale.error(`${chalk.italic.yellowBright(fileName)} 上传失败，第 ${attemptNumber}/5 次重试`);
                        }
                    }
                );
            }),
            { concurrency: CONCURRENCY }
        );
    } catch (err) {
        signale.error(err);
    }
}
