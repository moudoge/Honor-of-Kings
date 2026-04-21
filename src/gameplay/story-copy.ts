export type MissionMode = 'standard' | 'pressure';

export function getModeLabel(mode: MissionMode): string {
  return mode === 'pressure' ? '围城极限行动' : '围城应急行动';
}

export function getObjectiveNeed(mode: MissionMode): number {
  return mode === 'pressure' ? 4 : 3;
}

export const MAIN_MENU_COPY = {
  title: '王者荣耀·长城守卫军',
  subtitle: '百里守约：围城补给行动',
  kicker: '长城被围  补给断裂  每次出城都是一次搏命搜集',
  controls: '操作：WASD移动 鼠标瞄准射击 R换弹 F交互 Q/E/Space技能',
  storyPanel: [
    '【战况通报】',
    '长城守卫军被魔种围困，外部补给线已经被切断。',
    '城内军粮、药品和守城器械都在告急。',
    '',
    '百里守约受命出城，前往废弃据点、残破营地和散落补给点，',
    '尽可能把还能用的食物、药材和军需带回长城。',
    '',
    '花木兰统筹全局，铠守住前线，百里玄策负责外线侦查与路线回传。',
  ].join('\n'),
};

export function getPreparationCopy(aiAssistant: boolean) {
  return {
    title: '任务准备',
    subtitle: '出城前确认敌情强度与战场智能助手协同方式',
    standardTitle: '围城应急行动',
    standardBodyTitle: '适合常规演示：',
    standardBody: '目标 3 份关键补给，外线压力较缓，适合熟悉路线',
    pressureTitle: '围城极限行动',
    pressureBodyTitle: '补给更加紧急：',
    pressureBody: '目标 4 份关键补给，增援更快，精英怪更活跃',
    aiToggle: aiAssistant
      ? '战场 AI：已开启（NPC 会结合战况给出动态播报与对话）·点击切换'
      : '战场 AI：已关闭（仅保留手动行动与静态提示）·点击切换',
    back: '返回首页',
    next: '\u4e0b\u4e00\u6b65\uff1a\u89d2\u8272\u9009\u62e9',
  };
}

export function getBriefingLines(mode: MissionMode, aiAssistant: boolean): string[] {
  const objectiveNeed = getObjectiveNeed(mode);
  return [
    '【背景】长城被围，守军补给线断裂，城内已出现粮食和药品紧缺。',
    '【任务】百里守约从城门突围，搜集散落在长城外的军粮、药包和守城器械零件。',
    `【成功条件】回收 ${objectiveNeed} 份关键补给，任务立即判定完成。`,
    '【战术要点】',
    '1) 优先拿军粮、守城医疗包和器械零件，这些是当前最紧缺的物资。',
    '2) Q 静谧之眼：展开视野，帮助识别埋伏在废墟和沙丘后的魔种。',
    '3) E 狂风之息：原地架枪，扩大狙击威胁范围，适合处理高威胁单位。',
    '4) Space 后撤反击：被近身包夹时立刻拉开身位，保住补给。',
    `5) ${aiAssistant ? '战场 AI 已接入：队友会结合围城补给任务给出动态判断。' : '当前为纯手动模式：不显示 AI 对话辅助。'}`,
  ];
}

export const STORY_INTRO_LINES = [
  '花木兰·围城军令\n守约，城里已经见底了。先把军粮和药带回来，别把命折在外面。',
  '百里玄策·外线侦报\n东侧废营、北线军械架一带还有残存补给，我盯着魔种动向给你回线。',
  '战场通报\n外线补给点大多被洗劫过，优先搜可疑粮车、药箱堆和断裂军械架。',
];

export const NPC_PROFILE_COPY = {
  花木兰: {
    role: '长城守卫军统帅',
    line: '城里已经断粮，先把军粮和药找回来。物资比追杀更重要。',
    persona: '花木兰，长城守卫军统帅。你始终围绕围城、补给线、防线稳定和伤员保障来判断局势。你说话果断、简洁、有统筹感，会记住与玩家之前聊过的内容。',
  },
  铠: {
    role: '前线守线支援',
    line: '别恋战。拿够吃的和药就走，别让魔种把你困在沙丘和废墟里。',
    persona: '铠，长城守卫军前线重装战士。你最关心玩家会不会被包夹、站位会不会崩、带着补给能不能安全回线。你的提醒冷静直接，不说空话。',
  },
  百里玄策: {
    role: '外线侦查联络',
    line: '我盯路口和外侧动静，哪里还有粮袋、药箱和零件，我先告诉你。',
    persona: '百里玄策，长城守卫军侦察手。你关心路线、敌情和补给点去没去过。语气灵活敏捷，但不油滑。',
  },
};

export function getMissionSuccessText(collected: number): string {
  return `补给任务完成：已回收 ${collected} 份关键物资，足够支撑长城再守一阵。`;
}

export const MISSION_FAILURE_TEXT = '补给行动失败：守约倒在了城外。';
