#!/usr/bin/env node
/**
 * scripts/migrate-to-supabase.mjs — one-time move of the old shared
 * data/vocabulary.json + data/stories.json (plus their image folders)
 * into your new Supabase account.
 *
 * Run this once, on the machine where data/ actually lives (the droplet),
 * after you've:
 *   1. Created your Supabase project and run supabase/schema.sql.
 *   2. Set SUPABASE_URL/SUPABASE_ANON_KEY and restarted the app.
 *   3. Signed up for real in the running app.
 *   4. Found your new user id in the Supabase dashboard, under
 *      Authentication → Users (it looks like a uuid).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/migrate-to-supabase.mjs --user-id=<your-user-id>
 *
 * SUPABASE_SERVICE_ROLE_KEY is the one place this key is ever used — it
 * bypasses Row Level Security, which is exactly what's needed to write
 * rows on someone else's behalf during a one-off migration, and exactly
 * why it must never be set on the running server itself.
 */
import { readFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const userId = process.argv.find(a => a.startsWith('--user-id='))?.split('=')[1];
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!userId) {
  console.error('Usage: node scripts/migrate-to-supabase.mjs --user-id=<uuid>');
  process.exit(1);
}
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (see the comment at the top of this file).');
  process.exit(1);
}

const ROOT = process.cwd();
const DATA_DIR = join(ROOT, 'data');
const db = createClient(SUPABASE_URL, SERVICE_KEY);

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(join(DATA_DIR, file), 'utf8')); }
  catch { return fallback; }
}

/** Old images sat flat in data/images/<id>.png; the app now expects them
 *  under data/images/<user-id>/<id>.png. Copy (not move) so the original
 *  files are still there if anything about this needs re-running. */
async function namespaceImages(dir) {
  const src = join(DATA_DIR, dir);
  const dest = join(src, userId);
  let files = [];
  try { files = await readdir(src); } catch { return; }
  files = files.filter(f => !f.includes('/') && f !== userId);   // skip subfolders (already-namespaced runs)
  if (files.length === 0) return;
  await mkdir(dest, { recursive: true });
  for (const f of files) await copyFile(join(src, f), join(dest, f));
  console.log(`Copied ${files.length} file(s) from data/${dir}/ into data/${dir}/${userId}/`);
}

function rehomeImagePath(publicPath, dir) {
  // "/data/images/card-123.png" -> "/data/images/<user-id>/card-123.png"
  if (!publicPath) return publicPath;
  const prefix = `/data/${dir}/`;
  if (!publicPath.startsWith(prefix) || publicPath.startsWith(`${prefix}${userId}/`)) return publicPath;
  return `${prefix}${userId}/${publicPath.slice(prefix.length)}`;
}

async function main() {
  await namespaceImages('images');
  await namespaceImages('story-images');

  const vocab = await readJson('vocabulary.json', { collections: [], cards: [] });
  const stories = await readJson('stories.json', { stories: [] });

  if (vocab.collections.length) {
    const rows = vocab.collections.map(c => ({
      id: c.id, owner_id: userId, name: c.name,
      created_at: new Date(c.createdAt || Date.now()).toISOString(),
    }));
    const { error } = await db.from('collections').insert(rows);
    if (error) throw error;
    console.log(`Migrated ${rows.length} collection(s).`);
  }

  if (vocab.cards.length) {
    const rows = vocab.cards.map(c => ({
      id: c.id, owner_id: userId, collection_id: c.collectionId,
      word_fa: c.word_fa, word_en: c.word_en || '',
      image: rehomeImagePath(c.image, 'images'),
      created_at: new Date(c.createdAt || Date.now()).toISOString(),
    }));
    const { error } = await db.from('cards').insert(rows);
    if (error) throw error;
    console.log(`Migrated ${rows.length} card(s).`);
  }

  if (stories.stories.length) {
    const rows = stories.stories.map(s => ({
      id: s.id, owner_id: userId, cache_key: s.key, label: s.label,
      minutes: s.minutes, characters: s.characters,
      scenes: (s.scenes || []).map(sc => ({ ...sc, image: rehomeImagePath(sc.image, 'story-images') })),
      saved_at: new Date(s.savedAt || Date.now()).toISOString(),
    }));
    const { error } = await db.from('stories').insert(rows);
    if (error) throw error;
    console.log(`Migrated ${rows.length} stor${rows.length === 1 ? 'y' : 'ies'}.`);
  }

  console.log('\nDone. The old data/vocabulary.json and data/stories.json are untouched — safe to keep as a backup or delete once you\'ve confirmed everything shows up in the app.');
}

main().catch(e => {
  console.error('Migration failed:', e.message || e);
  process.exit(1);
});
