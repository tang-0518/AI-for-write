import { analyzeMarket }    from "./market.js";
import { buildWorldview }   from "./worldview.js";
import { designCharacters } from "./characters.js";
import { designTimeline }   from "./timeline.js";
import { buildStoryArc }    from "./storyarc.js";
import { researchStyle }    from "./style.js";
import { generateOutline }  from "./outline.js";
import { generateChapters } from "./chapters.js";

export type OrchestratorMode = "full" | "quick" | "outline_only";

interface Step {
  name:    string;
  modes:   OrchestratorMode[];
  run:     () => Promise<string>;
}

/** 日志输出到 stderr，不污染 MCP stdout 协议流 */
function log(msg: string) {
  process.stderr.write(`[orchestrator] ${msg}\n`);
}

export async function runOrchestrator(
  title:    string,
  premise:  string,
  genre:    string,
  ability:  string,
  mode:     OrchestratorMode = "full"
): Promise<string> {
  const steps: Step[] = [
    {
      name:  "①市场评估",
      modes: ["full", "quick", "outline_only"],
      run:   () => analyzeMarket(title, genre, ability),
    },
    {
      name:  "②世界观构建",
      modes: ["full", "quick", "outline_only"],
      run:   () => buildWorldview(title, premise),
    },
    {
      name:  "③人物设定",
      modes: ["full", "quick", "outline_only"],
      run:   () => designCharacters(title),
    },
    {
      name:  "④时间线设计",
      modes: ["full", "quick", "outline_only"],
      run:   () => designTimeline(title),
    },
    {
      name:  "⑤故事走向",
      modes: ["full", "quick", "outline_only"],
      run:   () => buildStoryArc(title),
    },
    {
      name:  "⑥文风研究",
      modes: ["full"],
      run:   () => researchStyle(title),
    },
    {
      name:  "⑦细纲生成",
      modes: ["full", "outline_only"],
      run:   () => generateOutline(title),
    },
    {
      name:  "⑧章纲生成",
      modes: ["full", "outline_only"],
      run:   () => generateChapters(title),
    },
  ];

  const completedSteps: string[] = [];
  const totalSteps = steps.filter(s => s.modes.includes(mode)).length;
  let done = 0;

  for (const step of steps) {
    if (!step.modes.includes(mode)) continue;

    done++;
    log(`[${done}/${totalSteps}] 开始执行：${step.name}`);

    try {
      const result = await step.run();
      completedSteps.push(
        `### ${step.name}\n✅ 已完成（${result.length} 字）`
      );
      log(`完成：${step.name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      completedSteps.push(`### ${step.name}\n❌ 失败：${msg}`);
      log(`失败：${step.name} — ${msg}`);
      // 遇到错误停止后续步骤，因为下游依赖上游
      break;
    }

    // 避免 API 限速
    await new Promise(r => setTimeout(r, 800));
  }

  return [
    `# 《${title}》创作准备完成报告`,
    `**模式：** ${mode}`,
    `**完成时间：** ${new Date().toLocaleString("zh-CN")}`,
    "",
    "## 各步骤执行结果",
    ...completedSteps,
    "",
    `## 下一步`,
    `小说圣经（bible.json）已保存在 novels/${title}/ 目录。`,
    `你现在可以开始写第一章了。`,
  ].join("\n");
}
