import chalk from 'chalk';
import { execa } from 'execa';
import { unzipSync } from 'fflate';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import signale from 'signale';

import { getGameAssetsPath, getGamePath } from './config.js';
import { SAINTCOINACH_PATH } from './constants.js';

const LATEST_RELEASE_URL = 'https://api.github.com/repos/xivapi/SaintCoinach/releases/latest';
const ZIP_FILE_NAME = 'SaintCoinach.Cmd.zip';
const HISTORY_FILE_NAME = 'SaintCoinach.History.zip';
const EXE_FILE_NAME = 'SaintCoinach.Cmd.exe';
const TOOLS_PATH = path.join(SAINTCOINACH_PATH, '..');

const sha256Hash = (data: Buffer) => crypto.createHash('sha256').update(data).digest('hex');

async function getLastestAsset() {
    const response = await fetch(LATEST_RELEASE_URL, { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
    const body = await response.json();
    const asset = body?.assets?.find((item: any) => item.name === ZIP_FILE_NAME);
    if (asset == null) return null;
    return {
        name: asset.name,
        url: asset.browser_download_url,
        size: asset.size,
        sha256: asset.digest.split(':')[1],
        timestamp: asset.updated_at
    };
}

async function downloadAsset(url: string) {
    const logger = new signale.Signale({ interactive: true });
    try {
        logger.await(`正在下载 ${url} ...`);
        const response = await fetch(url, { redirect: 'follow' });
        if (!response.ok) return null;
        const buffer = await response.arrayBuffer();
        if (!fs.existsSync(TOOLS_PATH)) fs.mkdirSync(TOOLS_PATH, { recursive: true });
        fs.writeFileSync(path.join(TOOLS_PATH, ZIP_FILE_NAME), Buffer.from(buffer));
        logger.success('下载成功');
    } catch (err) {
        logger.error('下载失败');
        signale.error(err);
    }
}

async function extractAsset() {
    const fileName = path.join(TOOLS_PATH, ZIP_FILE_NAME);
    if (!fs.existsSync(fileName)) return;

    const logger = new signale.Signale({ interactive: true });
    try {
        logger.start('正在解压缩...');
        const definitionPath = path.join(SAINTCOINACH_PATH, 'Definitions');
        if (fs.existsSync(definitionPath)) fs.rmSync(definitionPath, { recursive: true, force: true });
        const decompressed = unzipSync(fs.readFileSync(fileName));
        for (const key in decompressed) {
            const file = path.join(SAINTCOINACH_PATH, key);
            if (file.endsWith(path.sep)) continue;
            const dir = path.dirname(file);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(file, Buffer.from(decompressed[key]));
        }
        logger.success('解压缩成功');
    } catch (err) {
        logger.error('解压缩失败');
        signale.error(err);
    }
}

export async function updateSaintCoinach() {
    const asset = await getLastestAsset();
    const fileName = path.join(TOOLS_PATH, ZIP_FILE_NAME);
    if (fs.existsSync(fileName)) {
        if (sha256Hash(fs.readFileSync(fileName)) !== asset.sha256) await downloadAsset(asset.url);
    } else await downloadAsset(asset.url);
    await extractAsset();
}

export async function extractGameData() {
    const outputPath = getGameAssetsPath();
    if (outputPath == null) {
        signale.fatal('未能获取游戏版本，无法导出游戏数据');
        return;
    }
    if (fs.existsSync(outputPath)) {
        signale.note(`游戏数据导出目录 ${chalk.italic.yellowBright(outputPath)} 已存在`);
        signale.info('如果需要重新导出，请删除该目录');
        return;
    }

    const historyFile = path.join(SAINTCOINACH_PATH, HISTORY_FILE_NAME);
    if (fs.existsSync(historyFile)) fs.unlinkSync(historyFile);

    const args = [getGamePath(), 'lang chs', 'exd', 'uihd', 'exit'];
    for await (const line of execa({ cwd: SAINTCOINACH_PATH })`${path.join(SAINTCOINACH_PATH, EXE_FILE_NAME)} ${args}`) {
        const txt = String(line).trim();
        if (txt.endsWith(' is missing.') || txt.endsWith('is not an image.')) signale.warn(line);
        else if (txt.includes('failed: ')) signale.error(line);
        else if (txt.match(/^Command \d+: uihd/)) {
            signale.info(line);
            signale.note(chalk.yellow('注意：高清UI图片的导出（大约7G+大小）需要花费一定的时间，请耐心等待'));
        } else signale.info(line);
    }
    signale.success(`游戏数据已导出于 ${chalk.italic.yellowBright(outputPath)}`);
    signale.note('在更新wiki后可适时清理以避免占用磁盘空间');
}
