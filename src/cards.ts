import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import signale from 'signale';

import { getGameAssetsPath, getGameVersion } from './config.js';
import { OUTPUT_PATH } from './constants.js';

const PAGE_SIZE = 50;
const ROW_SIZE = 10;
const CARD_WIDTH = 208;
const CARD_HEIGHT = 256;
const ICON_SIZE = 44;

const CARD_START_NO = 87000;
const STAR_START_NO = 76531;
const NUMBER_START_NO = 76539;
const CARD_TYPES = ['帝国', '蛮神', '拂晓', '兽人'];

const ASSETS_PATH = getGameAssetsPath();
const ICON_PATH = path.join(ASSETS_PATH, 'ui', 'icon');
const CARDS_PATH = path.join(import.meta.dirname, 'cards');
const VERSION = getGameVersion();

function loadCardsData() {
    const cards = fs
        .readFileSync(path.join(ASSETS_PATH, 'exd', 'TripleTriadCardResident.csv'), 'utf8')
        .split('\n')
        .slice(4)
        .map(line =>
            line
                .trim()
                .split(',')
                .map(cell => {
                    if (cell === 'True' || cell == 'False') return cell === 'True';
                    if (cell === '') return cell;
                    return JSON.parse(cell);
                })
        );
    cards.splice(cards.length - 1, 1);
    return cards;
}

function loadImage(number: number, root?: string) {
    const fileName = path.join(root ?? ICON_PATH, (Math.floor(number / 1000) * 1000).toString().padStart(6, '0'), `${number.toString().padStart(6, '0')}_hr1.png`);
    return fs.existsSync(fileName) ? sharp(fileName) : null;
}

export async function generateCardPacks() {
    if (VERSION == null) {
        signale.error('无法获取游戏版本信息，请检查客户端是否完整');
        return;
    }
    if (!fs.existsSync(ICON_PATH)) {
        signale.error(`当前游戏版本 ${VERSION} 的数据尚未提取，请先执行提取操作`);
        return;
    }
    try {
        // 准备卡面图像
        const cardBaseImage = sharp(path.join(CARDS_PATH, 'cardtripletriad_hr1.png'));
        const cardImages: Record<string, Buffer> = {
            Base: await cardBaseImage.clone().extract({ left: 0, top: 0, width: CARD_WIDTH, height: CARD_HEIGHT }).toBuffer()
        };
        for (const key in CARD_TYPES)
            cardImages[CARD_TYPES[key]] = await cardBaseImage
                .clone()
                .extract({ left: 32 + ICON_SIZE * Number(key), top: CARD_HEIGHT, width: ICON_SIZE, height: ICON_SIZE })
                .resize(40, 40)
                .toBuffer();
        for (let i = 0; i < 5; i++)
            cardImages[`Rarity${i + 1}`] = await loadImage(STAR_START_NO + i, CARDS_PATH)
                .resize(64, 64)
                .toBuffer();
        for (let i = 0; i < 11; i++)
            cardImages[i] = await loadImage(NUMBER_START_NO + i, CARDS_PATH)
                .resize(32, 32)
                .toBuffer();

        const cards = loadCardsData();
        for (let i = 0; i < cards.length; i += PAGE_SIZE) {
            const pageCards = cards.slice(i, i + PAGE_SIZE);
            const layers = (
                await Promise.all(
                    pageCards.map((card, index) =>
                        (async () => {
                            const cardImage = loadImage(CARD_START_NO + Number(card[0]));
                            if (cardImage == null) return;
                            const [, , TopNum, BottomNum, LeftNum, RightNum, , Type] = card;
                            const Rarity = Number(card[6][card[6].length - 1]);
                            const left = (index % ROW_SIZE) * CARD_WIDTH;
                            const top = Math.floor(index / ROW_SIZE) * CARD_HEIGHT;
                            const invalid = TopNum === 0 && BottomNum === 0 && LeftNum === 0 && RightNum === 0 && Rarity === 0;
                            const layers = [
                                { input: cardImages.Base, top, left },
                                { input: invalid ? await cardImage.grayscale().toBuffer() : await cardImage.toBuffer(), top, left }
                            ];
                            if (!invalid) {
                                if (cardImages[`Rarity${Rarity}`]) layers.push({ input: cardImages[`Rarity${Rarity}`], top: top + 8, left: left + 16 });
                                if (cardImages[Type]) layers.push({ input: cardImages[Type], top: top + 6, left: left + (CARD_WIDTH - 50) });
                                layers.push({ input: cardImages[TopNum], top: top + 180, left: left + (CARD_WIDTH / 2 - 16) });
                                layers.push({ input: cardImages[BottomNum], top: top + 204, left: left + (CARD_WIDTH / 2 - 16) });
                                layers.push({ input: cardImages[LeftNum], top: top + 192, left: left + (CARD_WIDTH / 2 - 40) });
                                layers.push({ input: cardImages[RightNum], top: top + 192, left: left + (CARD_WIDTH / 2 + 8) });
                            }
                            return layers;
                        })()
                    )
                )
            )
                .filter(layer => layer != null)
                .flatMap(layer => layer);
            const outputPath = path.join(OUTPUT_PATH, VERSION);
            const fileName = `CardPack${Math.floor(i / PAGE_SIZE)}.webp`;
            await sharp({
                create: {
                    width: CARD_WIDTH * Math.min(pageCards.length, ROW_SIZE),
                    height: Math.ceil(pageCards.length / ROW_SIZE) * CARD_HEIGHT,
                    channels: 4,
                    background: { r: 0, b: 0, g: 0, alpha: 0 }
                }
            })
                .composite(layers)
                .webp({ quality: 70 })
                .toFile(path.join(outputPath, fileName));
            signale.success(chalk.italic.yellowBright(fileName));
        }
    } catch (err) {
        signale.error(err);
    }
}
