import Configstore from 'configstore';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { promisified as regedit } from 'regedit';
import signale from 'signale';

import { input, password } from '@inquirer/prompts';

import { SAINTCOINACH_PATH } from './constants.js';

type ConfigKey = 'gamePath' | 'botUser' | 'botPassword' | 'apiKey';

const REG_KEYS = [
    ['上海数龙科技有限公司', '最终幻想XIV'],
    ['SNDA', 'FFXIV']
];

const config = new Configstore('ff14.huijiwiki.com');

async function getDefaultGamePath(): Promise<string | null> {
    if (process.platform !== 'win32') return null;
    for (const keys of REG_KEYS) {
        const regKeys = ['HKLM', 'SOFTWARE'];
        if (process.arch === 'x64') regKeys.push('WOW6432Node');
        regKeys.push(...keys);
        const result = await regedit.list([regKeys.join('\\')]);
        for (const key in result) {
            const data = result[key];
            if (data.exists !== true) continue;
            if (data.values.Path?.value != null) return String(data.values.Path.value);
        }
    }
    return null;
}

function isGamePathValid(gamePath?: string) {
    gamePath = gamePath ?? config.get<string>('gamePath');
    if (gamePath == null) return false;
    const exe = path.join(gamePath, 'game', 'ffxiv_dx11.exe');
    if (!existsSync(exe)) return false;
    return true;
}

export async function checkConfig() {
    try {
        // 检查游戏客户端目录
        let gamePathValid = isGamePathValid();
        while (!gamePathValid) {
            const defaultGamePath = await getDefaultGamePath();
            const gamePath = await input({
                message: '请输入游戏客户端所在目录: ',
                default: defaultGamePath,
                required: true
            });
            config.set('gamePath', gamePath);
            gamePathValid = isGamePathValid();
        }
        // 获取其他的配置项
        for (const key of ['botUser', 'botPassword', 'apiKey'] as ConfigKey[]) {
            let value = config.get<string>(key);
            while (value == null || value.trim() === '') {
                let name = 'Bot用户名';
                let isPassword = false;
                switch (key) {
                    case 'botPassword':
                        name = 'Bot密码';
                        isPassword = true;
                        break;
                    case 'apiKey':
                        name = 'API密钥';
                        isPassword = true;
                        break;
                }
                if (isPassword)
                    value = await password({
                        message: `请输入${name}: `,
                        mask: true
                    });
                else
                    value = await input({
                        message: `请输入${name}: `,
                        required: true
                    });
            }
            config.set(key, value);
        }
    } catch (err) {
        if (err.name === 'ExitPromptError') process.exit(0);
        else signale.error(err);
    }
}

export function getGamePath() {
    return config.get<string>('gamePath');
}

export function getGameAssetsPath() {
    const version = getGameVersion();
    if (version == null) return null;
    return path.join(SAINTCOINACH_PATH, version);
}

export function getGameVersion() {
    const gamePath = getGamePath();
    const versionFile = path.join(gamePath, 'game', 'ffxivgame.ver');
    if (!existsSync(versionFile)) return null;
    return readFileSync(versionFile, 'utf8').trim();
}

export function getBotCredentials() {
    return {
        user: config.get<string>('botUser'),
        password: config.get<string>('botPassword'),
        apiKey: config.get<string>('apiKey')
    };
}
