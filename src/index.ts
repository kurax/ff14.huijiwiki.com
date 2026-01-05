import signale from 'signale';

import { rawlist } from '@inquirer/prompts';

import { checkConfig } from './config.js';
import { extractGameData, updateSaintCoinach } from './saintcoinach.js';

await checkConfig();

try {
    let exit = false;
    while (!exit) {
        const action = await rawlist({
            message: '请选择要执行的操作: ',
            default: 'update',
            choices: [
                { name: '更新 Saint Coinach 工具 (需要翻墙)', value: 'saintcoinach' },
                { name: '从客户端提取游戏数据', value: 'extract' },
                // { name: '上传处理后的文件到Wiki', value: 'upload' },
                { name: '退出', value: 'quit' }
            ]
        });
        switch (action) {
            case 'extract':
                await extractGameData();
                break;
            case 'saintcoinach':
                await updateSaintCoinach();
                break;
            default:
                exit = true;
                break;
        }
    }
} catch (err) {
    if (err.name === 'ExitPromptError') process.exit(0);
    else signale.error(err);
}
