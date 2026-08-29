import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { IMAGES_DIR, ROOT, STORY_IMAGES_DIR } from './env.js';

export function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function saveImageFile(userId, id, dataUrl, dir = IMAGES_DIR) {
  const match = /^data:image\/(\w+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) throw new Error('That image could not be saved.');
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const userDir = join(dir, userId);
  await mkdir(userDir, { recursive: true });
  const filename = `${id}.${ext}`;
  await writeFile(join(userDir, filename), Buffer.from(match[2], 'base64'));
  return `/data/${dir === STORY_IMAGES_DIR ? 'story-images' : 'images'}/${userId}/${filename}`;
}

export async function deleteImageFile(publicPath) {
  if (!publicPath || !/^\/data\/(images|story-images)\/[^/]+\/[^/]+$/.test(publicPath)) return;
  try { await unlink(join(ROOT, publicPath)); } catch {  }
}
