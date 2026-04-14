import fs from 'fs';
import { chromium } from 'playwright';
import crypto from 'crypto';

const envStr = fs.readFileSync('.env.local', 'utf-8');
const apiKey = envStr.split('\n').find(l => l.startsWith('VITE_GEMINI_API_KEY=')).split('=')[1].trim();

async function callGenAI(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
       systemInstruction: { parts: [{ text: "你是一个顶级的网络小说大神，擅长写末日求生、科幻题材的小说。文笔极佳，剧情紧凑，悬念迭起。" }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192, temperature: 0.8 }
    })
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.candidates[0].content.parts[0].text;
}

const outlinePrompt = `请为书名为《全民火箭求生》的小说设计10个章节的大纲。每章大约2500字的情节容量。
题材：末日求生、科幻、系统流。
背景：全球几十亿人突然被随机分配到太空中漂浮的破旧火箭舱内。火箭内物资极度匮乏，所有人必须通过探索宇宙碎片、收集物资、升级火箭来求生。
请直接输出 JSON 格式：
{
  "synopsis": "全书简介...",
  "characters": [ {"name":"主角姓名","desc":"描述"} ],
  "worldRules": [ {"name":"规则一","desc":"描述"} ],
  "chapters": [
    { "title": "第一章：xxx", "summary": "本章概要，包含大约2500字的情节节点..." }
  ]
}
不要输出 markdown 标记（如 \`\`\`json ），只输出 JSON。`;

console.log('Generating outline...');
let outlineText = await callGenAI(outlinePrompt);
outlineText = outlineText.replace(/```json/g, '').replace(/```/g, '').trim();
const outline = JSON.parse(outlineText);
console.log('Outline generated.');

console.log('Generating 10 chapters concurrently...');
const chapterPromises = outline.chapters.map((ch, idx) => {
  const prompt = `根据以下《全民火箭求生》的大纲，撰写第${idx + 1}章正文。
全书简介：${outline.synopsis}
本章标题：${ch.title}
本章情节要点：${ch.summary}

写作要求：
1. 字数必须达到2000字到2500字之间！！！展开详写，多加环境描写、内心独白和动作细节。
2. 语言风格紧凑刺激，代入感极强。
3. 直接输出小说正文，不要有任何多余的开头或结尾分析。`;
  return callGenAI(prompt).then(content => ({
    title: ch.title,
    content: content,
    summary: ch.summary
  })).catch(e => {
    console.error(`Chapter ${idx+1} failed:`, e);
    return { title: ch.title, content: "生成失败。", summary: "" };
  });
});

const chapters = await Promise.all(chapterPromises);
console.log('Chapters generated successfully.');

// Now inject into IndexedDB via Playwright
console.log('Injecting into database...');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:5175/');
await page.waitForTimeout(2000);

await page.evaluate(async ({ outline, chapters }) => {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('novel-assistant');
    req.onsuccess = (e) => {
      const db = e.target.result;
      const now = Date.now();
      const bookId = 'book_' + now;
      
      const tx = db.transaction(['books', 'drafts', 'memories', 'kv', 'character_capsules'], 'readwrite');
      
      // Clear existing drafts and books just for this clean demo
      tx.objectStore('books').clear();
      tx.objectStore('drafts').clear();
      tx.objectStore('memories').clear();
      tx.objectStore('character_capsules').clear();

      // Insert Book
      tx.objectStore('books').put({
        id: bookId,
        title: '全民火箭求生',
        synopsis: outline.synopsis,
        createdAt: now,
        updatedAt: now
      });

      // Insert Characters & World Rules into Memories
      outline.characters.forEach((c, i) => {
        tx.objectStore('memories').put({
          id: 'mem_char_' + i,
          bookId: bookId,
          type: 'character',
          name: c.name,
          content: c.desc,
          createdAt: now,
          updatedAt: now
        });
        tx.objectStore('character_capsules').put({
          id: 'cap_' + i,
          bookId: bookId,
          name: c.name,
          oneLiner: '主角/重要角色',
          appearance: '详见简介',
          personality: '详见简介',
          background: c.desc,
          relationships: [],
          secrets: '',
          customTags: [],
          createdAt: now,
          updatedAt: now,
          avatarUrl: ''
        });
      });

      outline.worldRules.forEach((w, i) => {
        tx.objectStore('memories').put({
          id: 'mem_world_' + i,
          bookId: bookId,
          type: 'world',
          name: w.name,
          content: w.desc,
          createdAt: now,
          updatedAt: now
        });
      });

      // Insert Chapters
      const chapterIds = [];
      chapters.forEach((ch, idx) => {
        const dId = 'draft_' + idx;
        chapterIds.push(dId);
        tx.objectStore('drafts').put({
          id: dId,
          bookId: bookId,
          title: ch.title,
          content: ch.content,
          order: idx,
          createdAt: now,
          updatedAt: now,
          contextState: { compactionCount: 0, consecutiveCompactFailures: 0, compactDisabled: false, compactSummary: ch.summary, lastCompactedAt: null }
        });
      });

      tx.objectStore('kv').put(bookId, 'active-book-id');
      tx.objectStore('kv').put([bookId], 'book-order');
      tx.objectStore('kv').put(chapterIds, `chapter-order-${bookId}`);
      if(chapterIds.length > 0) tx.objectStore('kv').put(chapterIds[0], 'active-draft-id');

      tx.oncomplete = () => resolve('Success');
      tx.onerror = () => reject(tx.error);
    };
  });
}, { outline, chapters });

await browser.close();
console.log('Database injection complete!');
