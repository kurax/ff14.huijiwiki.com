import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import signale from 'signale';

import { getGameAssetsPath, getGameVersion } from './config.js';
import { OUTPUT_PATH, SAINTCOINACH_PATH } from './constants.js';

const ICON_SIZE = 80;
const ICON_ROW_SIZE = 20;

const ASSETS_PATH = getGameAssetsPath();
const ICON_PATH = path.join(ASSETS_PATH, 'ui', 'icon');
const VERSION = getGameVersion();

export async function generateIconPacks() {
    if (VERSION == null) {
        signale.error('无法获取游戏版本信息，请检查客户端是否完整');
        return;
    }
    if (!fs.existsSync(ICON_PATH)) {
        signale.error(`当前游戏版本 ${VERSION} 的数据尚未提取，请先执行提取操作`);
        return;
    }
    try {
        const iconPaths: [iconPath: string, prefix: string][] = [];
        for (let i = 0; i < 100; i++) {
            const group = `${i.toString().padStart(3, '0')}000`;
            const groupPath = path.join(ICON_PATH, group);
            for (const isHQ of [false, true]) {
                const iconPath = isHQ ? path.join(groupPath, 'hq') : groupPath;
                if (fs.existsSync(iconPath)) iconPaths.push([iconPath, `Pack_${group}${isHQ ? '_hq' : ''}`]);
            }
        }
        for (let i = 0; i < iconPaths.length; i++) {
            const [iconPath, prefix] = iconPaths[i];
            signale.start(`[${i + 1}/${iconPaths.length}] ${chalk.italic.yellowBright(path.relative(SAINTCOINACH_PATH, iconPath))} ...`);
            const files = fs.readdirSync(iconPath).filter(file => file.endsWith('.png'));
            const images = files.reduce<Record<string, sharp.Sharp>>((result, file) => {
                result[file] = sharp(path.join(iconPath, file));
                return result;
            }, {});
            for (let j = 2; j >= 0; j--) {
                const mip = Math.pow(2, j);
                const iconSize = ICON_SIZE / mip;
                const fileName = `${prefix}_${iconSize}.webp`;
                let max = 0;
                const layers = await Promise.all(
                    files.map(file =>
                        (async () => {
                            const index = parseInt(file, 10) % 1000;
                            max = Math.max(max, index);
                            const left = (index % ICON_ROW_SIZE) * iconSize;
                            const top = Math.floor(index / ICON_ROW_SIZE) * iconSize;
                            const { width, height } = await images[file].metadata();
                            if (width === iconSize && height === iconSize) return { input: await images[file].toBuffer(), top, left };
                            return { input: await images[file].clone().resize(iconSize, iconSize, { fit: 'inside' }).toBuffer(), top, left };
                        })()
                    )
                );
                const width = iconSize * (max < ICON_ROW_SIZE ? max + 1 : ICON_ROW_SIZE);
                const height = iconSize * Math.ceil(max / ICON_ROW_SIZE);
                const buffer = await sharp({ create: { width, height, channels: 4, background: { r: 0, b: 0, g: 0, alpha: 0 } } })
                    .composite(layers)
                    .webp()
                    .toBuffer();
                const outputPath = path.join(OUTPUT_PATH, VERSION);
                if (!fs.existsSync(outputPath)) fs.mkdirSync(outputPath, { recursive: true });
                fs.writeFileSync(path.join(outputPath, fileName), buffer);
                signale.success(chalk.italic.yellowBright(fileName));
            }
        }
    } catch (err) {
        signale.error(err);
    }
}
