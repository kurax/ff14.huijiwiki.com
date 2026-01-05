import signale from 'signale';

import { rawlist } from '@inquirer/prompts';

import { generateCardPacks } from './cards.js';
import { checkConfig } from './config.js';
import { generateIconPacks } from './icons.js';
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
                { name: '生成游戏图标雪碧图', value: 'iconpacks' },
                { name: '生成幻卡卡牌雪碧图', value: 'cardpacks' },
                { name: '退出', value: 'quit' }
            ]
        });
        switch (action) {
            case 'saintcoinach':
                await updateSaintCoinach();
                signale.info('操作已完成: 更新 Saint Coinach 工具');
                break;
            case 'extract':
                await extractGameData();
                signale.info('操作已完成: 从客户端提取游戏数据');
                break;
            case 'iconpacks':
                await generateIconPacks();
                signale.info('操作已完成: 生成游戏图标雪碧图');
                break;
            case 'cardpacks':
                await generateCardPacks();
                signale.info('操作已完成: 生成幻卡卡牌雪碧图');
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
