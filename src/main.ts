// @ts-nocheck
import Phaser from 'phaser';
import './style.css';
import { requestNpcDialogue } from './ai/client';
import { DialogueOverlay } from './ui/dialogueOverlay';
import {
  MAIN_MENU_COPY,
  STORY_INTRO_LINES,
  NPC_PROFILE_COPY,
  getBriefingLines,
  getMissionSuccessText,
  getModeLabel,
  getObjectiveNeed,
  getPreparationCopy,
  MISSION_FAILURE_TEXT,
} from './gameplay/story-copy';
import {
  SUPPLY_CACHE_LAYOUT,
  buildSupplyItems,
  getSupplyColor,
  getSupplyItem,
  getSupplyPrompt,
  getSupplyThemeText,
  isCriticalSupply,
} from './gameplay/supply-data';
import { NPC_PATROL_ROUTES } from './gameplay/environment-layout';

type ItemKind = 'food' | 'medical' | 'survival' | 'ordnance';
type WeaponId = 'sniper_rifle';
type AmmoType = 'sniper';
type PlayerState = 'idle' | 'walk' | 'aim' | 'fire' | 'hurt';
type EnemyKind = 'grunt' | 'elite' | 'boss';
type StoneGolemType = 'crimson_statue' | 'azure_statue';

interface ItemStack {
  id: string;
  label: string;
  kind: ItemKind;
  count: number;
  critical?: boolean;
  tag?: string;
  icon?: string;
  accent?: string;
}

interface WeaponConfig {
  id: WeaponId;
  damage: number;
  fireDelay: number;
  magSize: number;
  reloadMs: number;
  spreadDeg: number;
  projectileSpeed: number;
  auto: boolean;
  ammoType?: AmmoType;
  isMelee: boolean;
}

interface EnemyUnit {
  sprite: Phaser.Physics.Arcade.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  kind: EnemyKind;
  stoneGolemType?: StoneGolemType;
  shotsToKillRemaining?: number;
  lastDamageAt: number;
  hp: number;
  maxHp: number;
  speed: number;
  attackDamage: number;
  chaseRadius: number;
  wanderDir: Phaser.Math.Vector2;
  lastAttackAt: number;
  anchor: Phaser.Math.Vector2;
  nextRetargetAt: number;
  stealthUntil?: number;
  burstReadyAt?: number;
}

interface LootContainer {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  title: string;
  items: ItemStack[];
  opened: boolean;
  theme?: string;
  prompt?: string;
  hint?: string;
}

interface CampfireStation {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  title: string;
  prompt: string;
}

interface SupplySubmitStation {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  title: string;
  prompt: string;
}

interface NpcUnit {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  label: Phaser.GameObjects.Text;
  name: string;
  role: string;
  line: string;
  persona: string;
  state: 'idle' | 'patrol' | 'guard' | 'observe' | 'support' | 'warn';
  speed: number;
  patrolRoute: Phaser.Math.Vector2[];
  patrolIndex: number;
  target: Phaser.Math.Vector2;
  facingLeft: boolean;
  stateUntil: number;
  talkCooldownUntil: number;
}

interface MissionSetupConfig {
  mode: 'standard' | 'pressure';
  aiAssistant: boolean;
}

interface ObstacleBlock {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface BushPatch {
  x: number;
  y: number;
  radius: number;
}

const DEFAULT_MISSION_CONFIG: MissionSetupConfig = {
  mode: 'standard',
  aiAssistant: true,
};

const VIEW_WIDTH = 1280;
const VIEW_HEIGHT = 720;
const WORLD_WIDTH = 4200;
const WORLD_HEIGHT = 2600;
const NORMAL_ATTACK_RANGE = 420;
const SNIPE_ATTACK_RANGE = 1280;
const FORTRESS_LEFT = 220;
const FORTRESS_RIGHT = 1520;
const FORTRESS_TOP = 1660;
const FORTRESS_BOTTOM = 2380;
const GATE_X = 920;
const GATE_WIDTH = 220;
const GATE_INNER_DEPTH = 210;
const MAP_EDGE_WALL_THICKNESS = 52;
const UI_DEPTH_BASE = 5200;
const WORLD_LABEL_DEPTH = UI_DEPTH_BASE - 900;

const WEAPON_CONFIG: Record<WeaponId, WeaponConfig> = {
  sniper_rifle: {
    id: 'sniper_rifle',
    damage: 280,
    fireDelay: 430,
    magSize: 5,
    reloadMs: 1600,
    spreadDeg: 0.65,
    projectileSpeed: 820,
    auto: false,
    ammoType: 'sniper',
    isMelee: false,
  },
};

const PLAYER_STATE_PRIORITY: Record<PlayerState, number> = {
  idle: 1,
  walk: 2,
  aim: 3,
  fire: 4,
  hurt: 5,
};

const CHARACTER_SIZE_MULTIPLIER = 1.5;
const GRUNT_VISUAL_SCALE_MULTIPLIER = 1.8;
const GRUNT_COLLIDER_SCALE_MULTIPLIER = 1.8;
const YELLOW_GRUNT_COLLIDER_MULTIPLIER = 1.8;
const STONE_GOLEM_SIZE_MULTIPLIER = 1.8;
const GRUNT_COLLIDER_SIZE = Math.round(42 * CHARACTER_SIZE_MULTIPLIER * GRUNT_COLLIDER_SCALE_MULTIPLIER);
const PLAYER_SHADOW_Y_OFFSET = Math.round(14 * CHARACTER_SIZE_MULTIPLIER);
const ENEMY_SHADOW_Y_OFFSET = Math.round(12 * CHARACTER_SIZE_MULTIPLIER);
const NPC_SHADOW_Y_OFFSET = Math.round(12 * CHARACTER_SIZE_MULTIPLIER);
const NPC_LABEL_Y_OFFSET = Math.round(34 * CHARACTER_SIZE_MULTIPLIER);
const HERBAL_POUCH_HEAL = 15;
const BANDAGE_ROLL_HEAL = 5;
const CAMPFIRE_MEAL_HEAL = 32;
const CAMPFIRE_CRAFT_COST = 3;
const RECOVERY_USE_DURATION_MS = 2000;
const SNIPER_AMMO_SINGLE_PICKUP_COUNT = 10;
const STONE_GOLEM_SHOTS_TO_KILL = 5;
const STONE_GOLEM_FIRST_SPAWN_DELAY_MS = 30000;
const STONE_GOLEM_SECOND_SPAWN_DELAY_MS = 10000;
const STONE_GOLEM_DISPLAY_HEIGHT = Math.round(82 * CHARACTER_SIZE_MULTIPLIER * 1.48 * STONE_GOLEM_SIZE_MULTIPLIER);
const STONE_GOLEM_HIT_DEBOUNCE_MS = 90;
const STONE_GOLEM_TYPES: StoneGolemType[] = ['crimson_statue', 'azure_statue'];
const CAMPFIRE_CRAFT_SOURCE_ID = 'scarlet_meat';
const CAMPFIRE_CRAFT_OUTPUT_ID = 'campfire_meal';
const CAMPFIRE_POSITION = { x: 845, y: 2148 } as const;
const SUPPLY_SUBMIT_POSITION = { x: 1118, y: 2086 } as const;
const PLAYER_SPAWN_POSITION = { x: CAMPFIRE_POSITION.x - 68, y: CAMPFIRE_POSITION.y } as const;
const STONE_GOLEM_SPAWN_POINTS: Record<StoneGolemType, Array<{ x: number; y: number }>> = {
  crimson_statue: [
    { x: 2440, y: 880 },
    { x: 2660, y: 1090 },
    { x: 3020, y: 860 },
  ],
  azure_statue: [
    { x: 3220, y: 1320 },
    { x: 3460, y: 1660 },
    { x: 3660, y: 1860 },
  ],
};
const E_SKILL_SHOT_SFX_KEYS = ['sfx_shouyue_e_shot_a', 'sfx_shouyue_e_shot_b'] as const;
const DASH_BACK_SPEED = 1000;
const Q_SCAN_RADIUS = 360;
const Q_SCAN_DURATION_MS = 9000;
const Q_SCAN_COOLDOWN_MS = 18000;
const MENU_BGM_KEY = 'bgm_rusted_wrecks';
const MENU_BGM_STORAGE_KEY = 'great_wall_bgm_volume';
const DEFAULT_MENU_BGM_VOLUME = 0.45;

let menuBgmVolume = loadMenuBgmVolume();
let menuBgmSound: Phaser.Sound.BaseSound | undefined;

function clamp01(value: number): number {
  return Phaser.Math.Clamp(value, 0, 1);
}

function loadMenuBgmVolume(): number {
  if (typeof window === 'undefined') return DEFAULT_MENU_BGM_VOLUME;
  try {
    const raw = window.localStorage.getItem(MENU_BGM_STORAGE_KEY);
    if (!raw) return DEFAULT_MENU_BGM_VOLUME;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? clamp01(parsed) : DEFAULT_MENU_BGM_VOLUME;
  } catch {
    return DEFAULT_MENU_BGM_VOLUME;
  }
}

function persistMenuBgmVolume(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MENU_BGM_STORAGE_KEY, String(menuBgmVolume));
  } catch {
    // Ignore storage failures (private mode / blocked storage).
  }
}

function setMenuBgmVolume(volume: number): number {
  menuBgmVolume = clamp01(volume);
  menuBgmSound?.setVolume(menuBgmVolume);
  persistMenuBgmVolume();
  return menuBgmVolume;
}

function ensureMenuBgm(scene: Phaser.Scene): void {
  if (!scene.cache.audio.exists(MENU_BGM_KEY)) return;

  if (!menuBgmSound || menuBgmSound.manager !== scene.sound || menuBgmSound.key !== MENU_BGM_KEY) {
    if (menuBgmSound?.isPlaying) {
      menuBgmSound.stop();
    }
    menuBgmSound = scene.sound.add(MENU_BGM_KEY, { loop: true, volume: menuBgmVolume });
  } else {
    menuBgmSound.setVolume(menuBgmVolume);
  }

  const playBgm = (): void => {
    if (!menuBgmSound || menuBgmSound.isPlaying) return;
    menuBgmSound.play();
  };

  if (scene.sound.locked) {
    scene.sound.once('unlocked', playBgm);
    scene.input.once('pointerdown', playBgm);
    scene.input.keyboard?.once('keydown', playBgm);
  } else {
    playBgm();
  }
}

class MainMenuScene extends Phaser.Scene {
  constructor() {
    super('MainMenuScene');
  }

  preload(): void {
    this.load.image('menu_mulan_banner', '/assets/official/npc_mulan_new.jpg');
    this.load.image('menu_portrait_mulan', '/assets/official/npc_mulan.png');
    this.load.image('menu_portrait_kai', '/assets/official/npc_kai.png');
    this.load.image('menu_portrait_shouyue', '/assets/custom/shouyue_idle.png');
    this.load.image('menu_portrait_xuance', '/assets/official/npc_xuance.png');
    this.load.image('menu_title_logo', '/assets/custom/menu_title_logo.png');
    this.load.image('menu_subtitle_logo', '/assets/custom/menu_subtitle_logo.png');
    this.load.image('menu_opening_cover', '/assets/custom/menu_opening_cover.webp');
    this.load.audio(MENU_BGM_KEY, '/assets/audio/bgm_rusted_wrecks.mp3');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a100b');
    ensureMenuBgm(this);
    const copy = MAIN_MENU_COPY;

    const g = this.add.graphics();
    g.fillGradientStyle(0x1f1410, 0x1f1410, 0x8a4f2b, 0x8a4f2b, 1);
    g.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    g.fillStyle(0x4e2c1a, 0.36).fillEllipse(280, 132, 860, 250);
    g.fillStyle(0x5f321c, 0.3).fillEllipse(1010, 164, 740, 220);
    g.fillStyle(0x201710, 0.82).fillTriangle(0, 466, 250, 328, 520, 466);
    g.fillStyle(0x261911, 0.86).fillTriangle(320, 466, 560, 314, 860, 466);
    g.fillStyle(0x2a1b13, 0.88).fillTriangle(700, 466, 980, 300, 1280, 466);

    if (this.textures.exists('menu_mulan_banner')) {
      this.add.image(918, 210, 'menu_mulan_banner')
        .setDisplaySize(780, 320)
        .setAlpha(0.14)
        .setTint(0xe2bc90);
    }

    const sunCore = this.add.circle(1020, 144, 96, 0xf8c280, 0.26);
    const sunHalo = this.add.circle(1020, 144, 150, 0xf8c280, 0.11);
    this.tweens.add({
      targets: [sunCore, sunHalo],
      alpha: { from: 0.08, to: 0.28 },
      duration: 3400,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    });

    const wallY = 558;
    this.add.rectangle(640, wallY, 1420, 210, 0x3f2b20, 0.95);
    this.add.rectangle(640, wallY - 56, 1420, 24, 0x6f4d36, 0.95);
    for (let x = -20; x < VIEW_WIDTH + 20; x += 50) {
      this.add.rectangle(x, wallY - 72, 18, 16, 0x8c6447, 0.95);
    }

    [
      { x: 490, y: wallY - 52 },
      { x: 790, y: wallY - 52 },
    ].forEach((torch) => {
      this.add.rectangle(torch.x, torch.y + 26, 12, 52, 0x4d3525, 0.95);
      const flame = this.add.ellipse(torch.x, torch.y - 8, 44, 30, 0xffaa56, 0.26);
      const ember = this.add.ellipse(torch.x, torch.y - 8, 20, 14, 0xffc888, 0.7);
      this.tweens.add({
        targets: [flame, ember],
        alpha: { from: 0.2, to: 0.75 },
        scaleX: { from: 0.94, to: 1.08 },
        scaleY: { from: 0.94, to: 1.08 },
        duration: 420,
        yoyo: true,
        repeat: -1,
      });
    });

    for (let i = 0; i < 14; i += 1) {
      const dust = this.add.circle(
        Phaser.Math.Between(40, VIEW_WIDTH - 40),
        Phaser.Math.Between(430, 700),
        Phaser.Math.Between(2, 5),
        0xe2b889,
        Phaser.Math.FloatBetween(0.06, 0.16),
      );
      this.tweens.add({
        targets: dust,
        x: dust.x + Phaser.Math.Between(-140, 140),
        y: dust.y - Phaser.Math.Between(40, 120),
        alpha: { from: dust.alpha, to: 0.01 },
        duration: Phaser.Math.Between(2600, 4300),
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      });
    }

    const titleLogoX = VIEW_WIDTH / 2;
    const subtitleRelativeOffsetX = 172;
    if (this.textures.exists('menu_title_logo')) {
      const titleLogo = this.add.image(titleLogoX, 108, 'menu_title_logo').setOrigin(0.5);
      const sourceWidth = titleLogo.width > 0 ? titleLogo.width : 1;
      const sourceHeight = titleLogo.height > 0 ? titleLogo.height : 1;
      const scale = Math.min(900 / sourceWidth, 160 / sourceHeight);
      titleLogo.setDisplaySize(
        Math.max(1, Math.round(sourceWidth * scale)),
        Math.max(1, Math.round(sourceHeight * scale)),
      );
    } else {
      this.add.text(640, 112, copy.title, {
        fontFamily: 'Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '56px',
        color: '#f5e8c7',
        fontStyle: 'bold',
        shadow: { color: '#000000dd', offsetX: 0, offsetY: 4, blur: 8, fill: true },
      }).setOrigin(0.5);
    }

    if (this.textures.exists('menu_subtitle_logo')) {
      const subtitleLogo = this.add.image(titleLogoX + subtitleRelativeOffsetX, 198, 'menu_subtitle_logo').setOrigin(0.5);
      const sourceWidth = subtitleLogo.width > 0 ? subtitleLogo.width : 1;
      const sourceHeight = subtitleLogo.height > 0 ? subtitleLogo.height : 1;
      const scale = Math.min(640 / sourceWidth, 92 / sourceHeight) * 0.64;
      subtitleLogo.setDisplaySize(
        Math.max(1, Math.round(sourceWidth * scale)),
        Math.max(1, Math.round(sourceHeight * scale)),
      );
    } else {
      this.add.text(640, 192, copy.subtitle, {
        fontFamily: 'Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '29px',
        color: '#d9c7a2',
        shadow: { color: '#00000099', offsetX: 0, offsetY: 2, blur: 4, fill: true },
      }).setOrigin(0.5);
    }

    this.add.text(640, 270, copy.kicker, {
      fontFamily: 'Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '21px',
      color: '#c2b5a3',
      align: 'center',
      wordWrap: { width: 860 },
    }).setOrigin(0.5);

    this.add.text(640, 308, copy.controls, {
      fontFamily: 'IBM Plex Mono, JetBrains Mono, monospace',
      fontSize: '15px',
      color: '#95b0af',
      align: 'center',
      wordWrap: { width: 890 },
    }).setOrigin(0.5);

    const squad = [
      { key: 'menu_portrait_mulan', name: '花木兰', role: '统帅 / 战线指挥', tint: 0xd39d70 },
      { key: 'menu_portrait_kai', name: '铠', role: '前线 / 近战压制', tint: 0x9caec4 },
      { key: 'menu_portrait_xuance', name: '百里玄策', role: '外线 / 侦查机动', tint: 0xb28686 },
    ];

    squad.forEach((member, idx) => {
      const x = 368 + idx * 272;
      if (this.textures.exists(member.key)) {
        const portrait = this.add.image(x, 374, member.key).setTint(0xffffff);
        const sourceWidth = portrait.width > 0 ? portrait.width : 1;
        const sourceHeight = portrait.height > 0 ? portrait.height : 1;
        const targetHeight = 118;
        const targetWidth = Math.max(1, Math.round(targetHeight * (sourceWidth / sourceHeight)));
        portrait.setDisplaySize(targetWidth, targetHeight);
        this.tweens.add({
          targets: portrait,
          y: portrait.y - 5,
          duration: 1500 + idx * 180,
          yoyo: true,
          repeat: -1,
          ease: 'sine.inOut',
        });
      }
      this.add.text(x, 452, member.name, {
        fontFamily: 'Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: '24px',
        color: '#f0e4cf',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      this.add.text(x, 480, member.role, {
        fontFamily: 'IBM Plex Mono, JetBrains Mono, monospace',
        fontSize: '14px',
        color: '#a9c3c1',
      }).setOrigin(0.5);
    });

    const enterBtn = this.add.rectangle(640, 568, 390, 76, 0x2f5a45, 0.98)
      .setStrokeStyle(2, 0xc9a970, 0.9)
      .setInteractive({ useHandCursor: true });
    const enterTxt = this.add.text(640, 568, '进入任务准备', {
      fontFamily: 'Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '31px',
      color: '#f4f1e6',
      fontStyle: 'bold',
      shadow: { color: '#00000099', offsetX: 0, offsetY: 2, blur: 3, fill: true },
    }).setOrigin(0.5);

    this.tweens.add({
      targets: [enterBtn, enterTxt],
      alpha: { from: 0.9, to: 1 },
      duration: 980,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    });

    const storyBtn = this.add.rectangle(640, 646, 320, 54, 0x213a43, 0.96)
      .setStrokeStyle(2, 0x6da2a8, 0.88)
      .setInteractive({ useHandCursor: true });
    const storyBtnTxt = this.add.text(640, 646, '查看围城前情', {
      fontFamily: 'Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '24px',
      color: '#d7ece3',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const setButtonHover = (
      btn: Phaser.GameObjects.Rectangle,
      label: Phaser.GameObjects.Text,
      fill: number,
      stroke: number,
      textColor: string,
    ): void => {
      btn.setFillStyle(fill, 1).setStrokeStyle(2, stroke, 1);
      label.setColor(textColor);
    };

    enterBtn.on('pointerover', () => setButtonHover(enterBtn, enterTxt, 0x3d7458, 0xffd49a, '#fff7ea'));
    enterBtn.on('pointerout', () => setButtonHover(enterBtn, enterTxt, 0x2f5a45, 0xc9a970, '#f4f1e6'));
    storyBtn.on('pointerover', () => setButtonHover(storyBtn, storyBtnTxt, 0x2b4a54, 0xa6d0d5, '#f1fbf8'));
    storyBtn.on('pointerout', () => setButtonHover(storyBtn, storyBtnTxt, 0x213a43, 0x6da2a8, '#d7ece3'));

    const volumePanel = this.add.rectangle(1098, 612, 314, 96, 0x172229, 0.92).setStrokeStyle(1, 0x557d84, 0.86);
    const volumeTitle = this.add.text(996, 588, 'BGM 音量', {
      fontFamily: 'Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '20px',
      color: '#d7ece3',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    const volumeValue = this.add.text(1188, 588, `${Math.round(menuBgmVolume * 100)}%`, {
      fontFamily: 'IBM Plex Mono, JetBrains Mono, monospace',
      fontSize: '16px',
      color: '#a8d2c9',
    }).setOrigin(1, 0.5);
    const sliderTrack = this.add.rectangle(1092, 620, 220, 8, 0x274248, 1).setStrokeStyle(1, 0x608f98, 0.9);
    const sliderFill = this.add.rectangle(982, 620, 220 * menuBgmVolume, 8, 0x7ac7b4, 1).setOrigin(0, 0.5);
    const sliderKnob = this.add.circle(982 + 220 * menuBgmVolume, 620, 11, 0xf3e9c8, 1).setStrokeStyle(2, 0x3a6f6d, 1);
    const volumeHint = this.add.text(1092, 644, '拖动滑条调节背景音乐音量', {
      fontFamily: 'Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '13px',
      color: '#87a7a6',
    }).setOrigin(0.5, 0.5);

    const trackLeft = sliderTrack.x - sliderTrack.width * 0.5;
    const trackWidth = sliderTrack.width;
    const redrawVolume = (volume: number): void => {
      const v = clamp01(volume);
      const fillWidth = Math.max(4, trackWidth * v);
      sliderFill.width = fillWidth;
      sliderKnob.x = trackLeft + trackWidth * v;
      volumeValue.setText(`${Math.round(v * 100)}%`);
    };
    const applyVolumeByPointerX = (pointerX: number): void => {
      const ratio = clamp01((pointerX - trackLeft) / trackWidth);
      setMenuBgmVolume(ratio);
      ensureMenuBgm(this);
      redrawVolume(menuBgmVolume);
    };
    redrawVolume(menuBgmVolume);

    sliderTrack.setInteractive({ useHandCursor: true });
    sliderFill.setInteractive({ useHandCursor: true });
    sliderKnob.setInteractive({ useHandCursor: true, draggable: false });
    volumePanel.setDepth(20);
    volumeTitle.setDepth(20);
    volumeValue.setDepth(20);
    sliderTrack.setDepth(20);
    sliderFill.setDepth(21);
    sliderKnob.setDepth(22);
    volumeHint.setDepth(20);

    let draggingVolume = false;
    const handlePress = (pointer: Phaser.Input.Pointer): void => {
      draggingVolume = true;
      applyVolumeByPointerX(pointer.x);
    };
    const handleMove = (pointer: Phaser.Input.Pointer): void => {
      if (!draggingVolume) return;
      applyVolumeByPointerX(pointer.x);
    };
    const stopDrag = (): void => {
      draggingVolume = false;
    };

    sliderTrack.on('pointerdown', handlePress);
    sliderFill.on('pointerdown', handlePress);
    sliderKnob.on('pointerdown', handlePress);
    this.input.on('pointermove', handleMove);
    this.input.on('pointerup', stopDrag);
    this.input.on('gameout', stopDrag);
    this.events.once('shutdown', () => {
      this.input.off('pointermove', handleMove);
      this.input.off('pointerup', stopDrag);
      this.input.off('gameout', stopDrag);
    });

    const modalMask = this.add.rectangle(640, 360, VIEW_WIDTH, VIEW_HEIGHT, 0x020508, 0.68)
      .setDepth(220)
      .setVisible(false)
      .setInteractive({ useHandCursor: false });
    if (modalMask.input) modalMask.input.enabled = false;

    const fromRegistry = this.registry.get('missionConfig') as MissionSetupConfig | undefined;
    let selectedMode: MissionSetupConfig['mode'] = fromRegistry?.mode ?? DEFAULT_MISSION_CONFIG.mode;
    let aiAssistant = fromRegistry?.aiAssistant ?? DEFAULT_MISSION_CONFIG.aiAssistant;
    const prepCopy = getPreparationCopy(aiAssistant);

    const storyPanelBg = this.add.rectangle(640, 360, 960, 530, 0x0f171b, 0.96)
      .setStrokeStyle(2, 0x688f95, 0.95)
      .setDepth(221)
      .setVisible(false);
    const storyPanelTitle = this.add.text(640, 118, '围城战况前情', {
      fontFamily: 'Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '34px',
      color: '#f2e7d1',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(223).setVisible(false);
    const storyPanelText = this.add.text(640, 350, copy.storyPanel, {
      fontFamily: 'Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '23px',
      lineSpacing: 10,
      color: '#e3eee8',
      wordWrap: { width: 820 },
      align: 'left',
    }).setOrigin(0.5).setDepth(223).setVisible(false);

    const closeStoryBtn = this.add.rectangle(640, 572, 220, 56, 0x2f4f54, 0.98)
      .setStrokeStyle(2, 0x8ad2bd, 0.98)
      .setInteractive({ useHandCursor: true })
      .setDepth(223)
      .setVisible(false);
    const closeStoryTxt = this.add.text(640, 572, '关闭', {
      fontFamily: 'Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '26px',
      color: '#eef8f3',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(224).setVisible(false);

    const prepPanelBg = this.add.rectangle(640, 360, 960, 530, 0x0f171b, 0.96)
      .setStrokeStyle(2, 0x688f95, 0.95)
      .setDepth(231)
      .setVisible(false);
    const prepInnerBg = this.add.rectangle(640, 402, 912, 452, 0x081117, 0.9)
      .setDepth(232)
      .setVisible(false);
    const prepTitle = this.add.text(640, 204, prepCopy.title, {
      fontFamily: 'Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '56px',
      color: '#e7f1ea',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(233).setVisible(false);
    const prepSubtitle = this.add.text(640, 252, prepCopy.subtitle, {
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: '17px',
      color: '#8fb6aa',
      align: 'center',
      wordWrap: { width: 820 },
    }).setOrigin(0.5).setDepth(233).setVisible(false);

    const modeStandard = this.add.rectangle(436, 350, 304, 170, 0x1b2f35, 0.95)
      .setStrokeStyle(2, 0x5a8a8a)
      .setDepth(233)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    const modePressure = this.add.rectangle(844, 350, 304, 170, 0x2b2720, 0.95)
      .setStrokeStyle(2, 0x8b6a47)
      .setDepth(233)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });

    const standardTitle = this.add.text(436, 318, prepCopy.standardTitle, {
      fontFamily: 'Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '40px',
      color: '#dcece6',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(234).setVisible(false);
    const standardBodyTitle = this.add.text(436, 370, prepCopy.standardBodyTitle, {
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: '15px',
      color: '#9bc7bb',
    }).setOrigin(0.5).setDepth(234).setVisible(false);
    const standardBody = this.add.text(436, 400, prepCopy.standardBody, {
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: '14px',
      color: '#9bc7bb',
      align: 'center',
      wordWrap: { width: 280 },
    }).setOrigin(0.5).setDepth(234).setVisible(false);

    const pressureTitle = this.add.text(844, 318, prepCopy.pressureTitle, {
      fontFamily: 'Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '40px',
      color: '#f2dcc4',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(234).setVisible(false);
    const pressureBodyTitle = this.add.text(844, 370, prepCopy.pressureBodyTitle, {
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: '15px',
      color: '#e0bf98',
    }).setOrigin(0.5).setDepth(234).setVisible(false);
    const pressureBody = this.add.text(844, 400, prepCopy.pressureBody, {
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: '14px',
      color: '#e0bf98',
      align: 'center',
      wordWrap: { width: 280 },
    }).setOrigin(0.5).setDepth(234).setVisible(false);

    const aiToggle = this.add.rectangle(640, 478, 740, 78, 0x1e332f, 0.9)
      .setStrokeStyle(2, 0x5da18c)
      .setDepth(233)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    const aiText = this.add.text(640, 478, '', {
      fontFamily: 'Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '24px',
      color: '#e3efe8',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(234).setVisible(false);

    const prepBackBtn = this.add.rectangle(470, 588, 280, 66, 0x1c282d, 0.96)
      .setStrokeStyle(2, 0x55727a)
      .setDepth(233)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    const prepBackTxt = this.add.text(470, 588, prepCopy.back, {
      fontFamily: 'Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '26px',
      color: '#d4e0e4',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(234).setVisible(false);

    const prepNextBtn = this.add.rectangle(810, 588, 360, 66, 0x274e4f, 0.96)
      .setStrokeStyle(2, 0x77b5a6)
      .setDepth(233)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    const prepNextTxt = this.add.text(810, 588, prepCopy.next, {
      fontFamily: 'Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: '26px',
      color: '#e8f4ee',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(234).setVisible(false);

    const storyObjects: Phaser.GameObjects.GameObject[] = [
      storyPanelBg,
      storyPanelTitle,
      storyPanelText,
      closeStoryBtn,
      closeStoryTxt,
    ];
    const prepObjects: Phaser.GameObjects.GameObject[] = [
      prepPanelBg,
      prepInnerBg,
      prepTitle,
      prepSubtitle,
      modeStandard,
      modePressure,
      standardTitle,
      standardBodyTitle,
      standardBody,
      pressureTitle,
      pressureBodyTitle,
      pressureBody,
      aiToggle,
      aiText,
      prepBackBtn,
      prepBackTxt,
      prepNextBtn,
      prepNextTxt,
    ];
    const prepInteractive: Array<Phaser.GameObjects.Rectangle> = [
      modeStandard,
      modePressure,
      aiToggle,
      prepBackBtn,
      prepNextBtn,
    ];
    const setInputEnabled = (obj: Phaser.GameObjects.GameObject, enabled: boolean): void => {
      const inputObj = (obj as unknown as { input?: Phaser.Types.Input.InputConfiguration & { enabled?: boolean } }).input;
      if (inputObj && typeof inputObj.enabled === 'boolean') inputObj.enabled = enabled;
    };

    let storyVisible = false;
    let prepVisible = false;
    const updateMaskVisibility = (): void => {
      const show = storyVisible || prepVisible;
      modalMask.setVisible(show);
      if (modalMask.input) modalMask.input.enabled = show;
    };
    const setStoryVisibleInternal = (show: boolean): void => {
      storyVisible = show;
      storyPanelBg.setVisible(show);
      storyPanelTitle.setVisible(show);
      storyPanelText.setVisible(show);
      closeStoryBtn.setVisible(show);
      closeStoryTxt.setVisible(show);
      setInputEnabled(closeStoryBtn, show);
      updateMaskVisibility();
    };
    const setPreparationVisibleInternal = (show: boolean): void => {
      prepVisible = show;
      prepObjects.forEach((obj) => obj.setVisible(show));
      prepInteractive.forEach((obj) => setInputEnabled(obj, show));
      updateMaskVisibility();
    };
    const setStoryVisible = (show: boolean): void => {
      if (show) setPreparationVisibleInternal(false);
      setStoryVisibleInternal(show);
    };
    const setPreparationVisible = (show: boolean): void => {
      if (show) setStoryVisibleInternal(false);
      setPreparationVisibleInternal(show);
    };
    const renderPreparationSelections = (): void => {
      const standardActive = selectedMode === 'standard';
      modeStandard.setStrokeStyle(standardActive ? 3 : 2, standardActive ? 0x8fd3bf : 0x5a8a8a);
      modePressure.setStrokeStyle(!standardActive ? 3 : 2, !standardActive ? 0xffc07d : 0x8b6a47);
      aiText.setText(
        aiAssistant
          ? '腾讯混元角色对话：已开启'
          : '腾讯混元角色对话：已关闭（本局不启用角色聊天）',
      );
      aiToggle.setFillStyle(aiAssistant ? 0x1e332f : 0x2d2b2b, 0.9);
    };
    renderPreparationSelections();
    setStoryVisibleInternal(false);
    setPreparationVisibleInternal(false);

    modeStandard.on('pointerdown', () => {
      selectedMode = 'standard';
      renderPreparationSelections();
    });
    modePressure.on('pointerdown', () => {
      selectedMode = 'pressure';
      renderPreparationSelections();
    });
    aiToggle.on('pointerdown', () => {
      aiAssistant = !aiAssistant;
      renderPreparationSelections();
    });
    prepBackBtn.on('pointerdown', () => setPreparationVisible(false));
    prepNextBtn.on('pointerdown', () => {
      this.registry.set('missionConfig', {
        mode: selectedMode,
        aiAssistant,
      } satisfies MissionSetupConfig);
      setPreparationVisible(false);
      this.scene.start('CharacterSelectScene');
    });

    storyBtn.on('pointerdown', () => setStoryVisible(true));
    closeStoryBtn.on('pointerdown', () => setStoryVisible(false));
    enterBtn.on('pointerdown', () => setPreparationVisible(true));
    this.input.keyboard?.on('keydown-ENTER', () => {
      if (!storyVisible && !prepVisible) setPreparationVisible(true);
    });
    this.input.keyboard?.on('keydown-ESC', () => {
      if (storyVisible) setStoryVisible(false);
      if (prepVisible) setPreparationVisible(false);
    });

    const shouldOpenPreparationWindow = Boolean(this.registry.get('openPreparationWindow'));
    if (shouldOpenPreparationWindow) {
      this.registry.set('openPreparationWindow', false);
      setPreparationVisible(true);
    }

    if (this.textures.exists('menu_opening_cover')) {
      const openingCover = this.add.image(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, 'menu_opening_cover')
        .setDisplaySize(VIEW_WIDTH, VIEW_HEIGHT)
        .setDepth(2000)
        .setAlpha(1)
        .setInteractive({ useHandCursor: false });
      this.tweens.add({
        targets: openingCover,
        alpha: 0,
        delay: 2000,
        duration: 1200,
        ease: 'sine.out',
        onComplete: () => openingCover.destroy(),
      });
    }
  }
}

class TrainingRoomScene extends Phaser.Scene {
  private selectedMode: MissionSetupConfig['mode'] = 'standard';
  private aiAssistant = true;

  constructor() {
    super('TrainingRoomScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0a1114');
    ensureMenuBgm(this);
    const copy = getPreparationCopy(this.aiAssistant);
    const g = this.add.graphics();
    g.fillStyle(0x0d171b, 1).fillRect(0, 0, 1280, 720);
    g.fillStyle(0x142126, 1).fillRect(80, 68, 1120, 584);
    g.lineStyle(2, 0x2f4a52, 0.95).strokeRect(80, 68, 1120, 584);
    g.fillStyle(0x0b1418, 1).fillRoundedRect(118, 124, 1044, 482, 12);

    this.add.text(640, 112, copy.title, {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '42px',
      color: '#dbe8de',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(640, 156, copy.subtitle, {
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: '17px',
      color: '#8fb6aa',
    }).setOrigin(0.5);

    const modeStandard = this.add.rectangle(410, 286, 340, 176, 0x1b2f35, 0.95)
      .setStrokeStyle(2, 0x5a8a8a)
      .setInteractive({ useHandCursor: true });
    const modePressure = this.add.rectangle(870, 286, 340, 176, 0x2b2720, 0.95)
      .setStrokeStyle(2, 0x8b6a47)
      .setInteractive({ useHandCursor: true });

    this.add.text(410, 236, copy.standardTitle, {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '30px',
      color: '#dcece6',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(410, 292, copy.standardBodyTitle, {
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: '15px',
      color: '#9bc7bb',
    }).setOrigin(0.5);
    this.add.text(410, 318, copy.standardBody, {
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: '14px',
      color: '#9bc7bb',
    }).setOrigin(0.5);

    this.add.text(870, 236, copy.pressureTitle, {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '30px',
      color: '#f2dcc4',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(870, 292, copy.pressureBodyTitle, {
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: '15px',
      color: '#e0bf98',
    }).setOrigin(0.5);
    this.add.text(870, 318, copy.pressureBody, {
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: '14px',
      color: '#e0bf98',
    }).setOrigin(0.5);

    const aiToggle = this.add.rectangle(640, 424, 740, 78, 0x1e332f, 0.9)
      .setStrokeStyle(2, 0x5da18c)
      .setInteractive({ useHandCursor: true });
    const aiText = this.add.text(640, 424, '', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '24px',
      color: '#e3efe8',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const renderSelections = (): void => {
      const standardActive = this.selectedMode === 'standard';
      modeStandard.setStrokeStyle(standardActive ? 3 : 2, standardActive ? 0x8fd3bf : 0x5a8a8a);
      modePressure.setStrokeStyle(!standardActive ? 3 : 2, !standardActive ? 0xffc07d : 0x8b6a47);
      aiText.setText(
        this.aiAssistant
          ? '腾讯混元角色对话：已开启'
          : '腾讯混元角色对话：已关闭（本局不启用角色聊天）',
      );
      aiToggle.setFillStyle(this.aiAssistant ? 0x1e332f : 0x2d2b2b, 0.9);
    };
    renderSelections();

    modeStandard.on('pointerdown', () => {
      this.selectedMode = 'standard';
      renderSelections();
    });
    modePressure.on('pointerdown', () => {
      this.selectedMode = 'pressure';
      renderSelections();
    });
    aiToggle.on('pointerdown', () => {
      this.aiAssistant = !this.aiAssistant;
      renderSelections();
    });

    const backBtn = this.add.rectangle(430, 548, 250, 64, 0x1c282d, 0.96)
      .setStrokeStyle(2, 0x55727a)
      .setInteractive({ useHandCursor: true });
    this.add.text(430, 548, copy.back, {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '26px',
      color: '#d4e0e4',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const nextBtn = this.add.rectangle(850, 548, 310, 64, 0x274e4f, 0.96)
      .setStrokeStyle(2, 0x77b5a6)
      .setInteractive({ useHandCursor: true });
    this.add.text(850, 548, copy.next, {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '26px',
      color: '#e8f4ee',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    backBtn.on('pointerdown', () => this.scene.start('MainMenuScene'));
    nextBtn.on('pointerdown', () => {
      this.registry.set('missionConfig', {
        mode: this.selectedMode,
        aiAssistant: this.aiAssistant,
      } satisfies MissionSetupConfig);
      this.scene.start('CharacterSelectScene');
    });
  }
}

class CharacterSelectScene extends Phaser.Scene {
  private selectedHeroId: 'baili-shouyue' | 'kai' | 'xuance' | 'mulan' | null = null;

  constructor() {
    super('CharacterSelectScene');
  }

  create(): void {
    ensureMenuBgm(this);
    const cfg = this.readConfig();

    this.cameras.main.setBackgroundColor('#0b1218');
    const g = this.add.graphics();
    g.fillStyle(0x0c141b, 1).fillRect(0, 0, 1280, 720);
    g.fillStyle(0x12202a, 1).fillRect(60, 54, 1160, 612);
    g.lineStyle(2, 0x3f6479, 0.95).strokeRect(60, 54, 1160, 612);
    g.fillStyle(0x0a151d, 1).fillRoundedRect(92, 112, 1096, 486, 12);

    this.add.text(640, 98, '角色选择', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '44px',
      color: '#e7f4ef',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(640, 144, `行动规格：${getModeLabel(cfg.mode)} · 战场 AI：${cfg.aiAssistant ? '开启' : '关闭'}`, {
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: '16px',
      color: '#8fb6aa',
    }).setOrigin(0.5);

    type HeroCard = {
      id: 'baili-shouyue' | 'kai' | 'xuance' | 'mulan';
      name: string;
      role: string;
      portraitKey: string;
      unlocked: boolean;
      x: number;
      accent: number;
      feature?: string;
      quote?: string;
    };

    const cards: HeroCard[] = [
      {
        id: 'kai',
        name: '铠',
        role: '战士/坦克',
        portraitKey: 'menu_portrait_kai',
        unlocked: false,
        x: 220,
        accent: 0x7fa8c7,
        feature: '自带回复的西方剑士，手上的剑和铠甲散发出令人刺骨的寒意',
        quote: '以绝望挥剑，着逝者为铠',
      },
      {
        id: 'baili-shouyue',
        name: '百里守约',
        role: '射手',
        portraitKey: 'menu_portrait_shouyue',
        unlocked: true,
        x: 500,
        accent: 0x78cab5,
        feature: '他的射击技术精妙无比，深谙戈壁上的生存与厨技之道。',
        quote: '今天的长城也很和平。',
      },
      {
        id: 'xuance',
        name: '百里玄策',
        role: '刺客',
        portraitKey: 'menu_portrait_xuance',
        unlocked: false,
        x: 780,
        accent: 0xc29292,
        feature: '他熟悉远近所有水草丰茂之地，无论野羚抑或大雁，最终都变成猎物满载而归。',
        quote: '全场醒目担当！',
      },
      {
        id: 'mulan',
        name: '花木兰',
        role: '战士',
        portraitKey: 'menu_portrait_mulan',
        unlocked: false,
        x: 1060,
        accent: 0xd3a074,
        feature: '长城守卫军的队长，战斗中灵活切换武器使她立于不败之地。',
        quote: '想活命吗？紧跟着我！',
      },
    ];

    const setInputEnabled = (obj: Phaser.GameObjects.GameObject, enabled: boolean): void => {
      const inputObj = (obj as unknown as { input?: Phaser.Types.Input.InputConfiguration & { enabled?: boolean } }).input;
      if (inputObj && typeof inputObj.enabled === 'boolean') inputObj.enabled = enabled;
    };

    const frameMap = new Map<HeroCard['id'], Phaser.GameObjects.Rectangle>();
    const portraitMap = new Map<HeroCard['id'], Phaser.GameObjects.Image>();
    const cardObjects: Array<{ card: HeroCard; frame: Phaser.GameObjects.Rectangle }> = [];

    const selectHero = (card: HeroCard, statusText: Phaser.GameObjects.Text): void => {
      if (!card.unlocked) {
        this.selectedHeroId = null;
        statusText.setText(`${card.name} 暂未解锁，请选择其他角色。`);
        cardObjects.forEach(({ card: currentCard, frame }) => {
          frame.setStrokeStyle(2, currentCard.accent, 0.9);
        });
        return;
      }
      this.selectedHeroId = card.id;
      statusText.setText(`已选择 ${card.name}，可进入下一步。`);
      cardObjects.forEach(({ card: currentCard, frame }) => {
        const selected = currentCard.id === this.selectedHeroId;
        frame.setStrokeStyle(selected ? 4 : 2, selected ? 0x94efe0 : currentCard.accent, selected ? 1 : 0.9);
      });
    };

    cards.forEach((card) => {
      this.add.rectangle(card.x, 350, 240, 320, 0x13232c, 0.98)
        .setStrokeStyle(2, card.accent, 0.92)
        .setInteractive({ useHandCursor: true });
      const frame = this.add.rectangle(card.x, 350, 240, 320)
        .setStrokeStyle(2, card.accent, 0.92)
        .setFillStyle(0x000000, 0);
      frameMap.set(card.id, frame);

      if (this.textures.exists(card.portraitKey)) {
        const portrait = this.add.image(card.x, 320, card.portraitKey).setOrigin(0.5);
        const sourceWidth = portrait.width > 0 ? portrait.width : 1;
        const sourceHeight = portrait.height > 0 ? portrait.height : 1;
        const targetHeight = 190;
        const targetWidth = Math.max(1, Math.round(targetHeight * (sourceWidth / sourceHeight)));
        portrait.setDisplaySize(targetWidth, targetHeight);
        portrait.setInteractive({ useHandCursor: true });
        portraitMap.set(card.id, portrait);
        if (card.id === 'kai') {
          portrait.setFlipX(true);
        }
        if (!card.unlocked) {
          portrait.setTint(0x8f8f8f);
          portrait.setAlpha(0.86);
        }
      } else {
        this.add.rectangle(card.x, 320, 170, 190, 0x1f3240, 1).setStrokeStyle(2, card.accent, 0.8);
        this.add.text(card.x, 320, '立绘缺失', {
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: '20px',
          color: '#a8bec9',
        }).setOrigin(0.5);
      }

      this.add.text(card.x, 458, card.name, {
        fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
        fontSize: '34px',
        color: card.unlocked ? '#edf8f5' : '#b5b8b9',
        fontStyle: 'bold',
      }).setOrigin(0.5);

      if (!card.unlocked) {
        this.add.rectangle(card.x + 70, 250, 108, 40, 0x50312c, 0.94).setStrokeStyle(2, 0xf2ad7f, 0.95);
        this.add.text(card.x + 70, 250, '未解锁', {
          fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
          fontSize: '24px',
          color: '#ffe1cc',
          fontStyle: 'bold',
        }).setOrigin(0.5);
      } else {
        this.add.rectangle(card.x + 72, 250, 96, 40, 0x214836, 0.9).setStrokeStyle(2, 0x6ecba7, 0.95);
        this.add.text(card.x + 72, 250, '可选择', {
          fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
          fontSize: '22px',
          color: '#d4f8e8',
          fontStyle: 'bold',
        }).setOrigin(0.5);
      }

      cardObjects.push({ card, frame });
    });

    const tooltipBg = this.add.rectangle(0, 0, 340, 140, 0x162a36, 0.95)
      .setStrokeStyle(2, 0x7bb7bf, 0.95)
      .setVisible(false)
      .setDepth(3000);
    const tooltipRole = this.add.text(0, 0, '', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '17px',
      color: '#b5d9d2',
      wordWrap: { width: 300 },
    }).setVisible(false).setDepth(3001);
    const tooltipFeature = this.add.text(0, 0, '', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '20px',
      color: '#d8ece7',
      wordWrap: { width: 300 },
    }).setVisible(false).setDepth(3001);
    const tooltipQuote = this.add.text(0, 0, '', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '14px',
      color: '#a8c4bc',
      wordWrap: { width: 300 },
    }).setVisible(false).setDepth(3001);

    const showHeroFeature = (card: HeroCard): void => {
      if (!card.feature) {
        tooltipBg.setVisible(false);
        tooltipRole.setVisible(false);
        tooltipFeature.setVisible(false);
        tooltipQuote.setVisible(false);
        return;
      }

      const roleText = `职业：${card.role}`;
      const quoteText = card.quote ? `“${card.quote}”` : '';
      const longestLen = Math.max(roleText.length, card.feature.length, quoteText.length);
      const wrapWidth =
        longestLen <= 18 ? 240
        : longestLen <= 28 ? 300
        : longestLen <= 38 ? 360
        : 420;
      const paddingX = 14;
      const paddingY = 12;
      const lineGap = 8;

      tooltipRole.setWordWrapWidth(wrapWidth, true).setText(roleText).setVisible(true);
      tooltipFeature.setWordWrapWidth(wrapWidth, true).setText(card.feature).setVisible(true);
      if (quoteText) {
        tooltipQuote.setWordWrapWidth(wrapWidth, true).setText(quoteText).setVisible(true);
      } else {
        tooltipQuote.setVisible(false);
      }

      const quoteHeight = tooltipQuote.visible ? tooltipQuote.height + lineGap : 0;
      const contentHeight = tooltipRole.height + lineGap + tooltipFeature.height + quoteHeight;
      const boxWidth = wrapWidth + paddingX * 2;
      const boxHeight = contentHeight + paddingY * 2;

      const placeRight = card.x <= 640;
      const halfW = boxWidth * 0.5;
      const halfH = boxHeight * 0.5;
      const edgePadding = 20;
      let centerX = card.x + (placeRight ? 120 + edgePadding + halfW : -(120 + edgePadding + halfW));
      centerX = Phaser.Math.Clamp(centerX, 92 + halfW, 1188 - halfW);
      let centerY = 320;
      centerY = Phaser.Math.Clamp(centerY, 112 + halfH, 598 - halfH);
      const left = centerX - halfW + paddingX;
      const top = centerY - halfH + paddingY;

      tooltipBg
        .setPosition(centerX, centerY)
        .setSize(boxWidth, boxHeight)
        .setDisplaySize(boxWidth, boxHeight)
        .setStrokeStyle(2, card.accent, 0.95)
        .setVisible(true);
      tooltipRole.setPosition(left, top).setVisible(true);
      tooltipFeature
        .setPosition(left, top + tooltipRole.height + lineGap)
        .setVisible(true);
      if (card.quote) {
        tooltipQuote
          .setPosition(left, top + tooltipRole.height + lineGap + tooltipFeature.height + lineGap)
          .setVisible(true);
      } else {
        tooltipQuote.setVisible(false);
      }
    };
    const hideHeroFeature = (): void => {
      tooltipBg.setVisible(false);
      tooltipRole.setVisible(false);
      tooltipFeature.setVisible(false);
      tooltipQuote.setVisible(false);
    };

    const statusHint = this.add.text(640, 560, '请选择角色。', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '22px',
      color: '#bfd7cf',
    }).setOrigin(0.5);

    const backBtn = this.add.rectangle(418, 608, 252, 62, 0x1c282d, 0.96)
      .setStrokeStyle(2, 0x55727a)
      .setInteractive({ useHandCursor: true });
    this.add.text(418, 608, '返回任务准备', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '26px',
      color: '#d4e0e4',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const nextBtn = this.add.rectangle(848, 608, 360, 62, 0x2d3f45, 0.92)
      .setStrokeStyle(2, 0x5f7f84)
      .setInteractive({ useHandCursor: true });
    this.add.text(848, 608, '下一步：出城前简报', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '26px',
      color: '#aac4c7',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const renderNextButton = (): void => {
      const canProceed = this.selectedHeroId === 'baili-shouyue';
      nextBtn.setFillStyle(canProceed ? 0x274e4f : 0x2d3f45, canProceed ? 0.96 : 0.92);
      nextBtn.setStrokeStyle(2, canProceed ? 0x77b5a6 : 0x5f7f84, 1);
      setInputEnabled(nextBtn, canProceed);
    };
    renderNextButton();

    const originalSelectHero = selectHero;
    const wrappedSelectHero = (card: HeroCard): void => {
      originalSelectHero(card, statusHint);
      renderNextButton();
    };

    cards.forEach((card) => {
      const frame = frameMap.get(card.id);
      if (!frame) return;
      frame.setInteractive({ useHandCursor: true });
      frame.on('pointerdown', () => wrappedSelectHero(card));
    });
    cards.forEach((card) => {
      const portrait = portraitMap.get(card.id);
      if (!portrait) return;
      portrait.on('pointerover', () => showHeroFeature(card));
      portrait.on('pointerout', hideHeroFeature);
      portrait.on('pointerdown', () => wrappedSelectHero(card));
    });

    this.input.keyboard?.on('keydown-ENTER', () => {
      if (this.selectedHeroId !== 'baili-shouyue') return;
      this.registry.set('selectedHeroId', this.selectedHeroId);
      this.scene.start('BriefingScene');
    });
    this.input.keyboard?.on('keydown-ESC', () => {
      this.registry.set('openPreparationWindow', true);
      this.scene.start('MainMenuScene');
    });

    backBtn.on('pointerdown', () => {
      this.registry.set('openPreparationWindow', true);
      this.scene.start('MainMenuScene');
    });

    nextBtn.on('pointerdown', () => {
      if (this.selectedHeroId !== 'baili-shouyue') {
        statusHint.setText('请选择角色。');
        return;
      }
      this.registry.set('selectedHeroId', this.selectedHeroId);
      this.scene.start('BriefingScene');
    });
  }

  private readConfig(): MissionSetupConfig {
    const fromRegistry = this.registry.get('missionConfig') as MissionSetupConfig | undefined;
    return {
      ...DEFAULT_MISSION_CONFIG,
      ...(fromRegistry ?? {}),
    };
  }
}

class BriefingScene extends Phaser.Scene {
  constructor() {
    super('BriefingScene');
  }

  create(): void {
    ensureMenuBgm(this);
    const cfg = this.readConfig();

    this.cameras.main.setBackgroundColor('#100f12');
    const g = this.add.graphics();
    g.fillStyle(0x130f12, 1).fillRect(0, 0, 1280, 720);
    g.fillStyle(0x1f171b, 1).fillRect(120, 64, 1040, 592);
    g.lineStyle(2, 0x65484a, 0.92).strokeRect(120, 64, 1040, 592);

    this.add.text(640, 112, '出城前简报', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '44px',
      color: '#f1d6bc',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(640, 160, `行动规格：${getModeLabel(cfg.mode)} · 战场 AI：${cfg.aiAssistant ? '开启' : '关闭'}`, {
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: '16px',
      color: '#d2b39d',
    }).setOrigin(0.5);

    const lines = getBriefingLines(cfg.mode, cfg.aiAssistant);

    lines.forEach((line, idx) => {
      this.add.text(160, 214 + idx * 38, line, {
        fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
        fontSize: idx >= 3 ? '23px' : '20px',
        color: idx === 3 ? '#ffcc9f' : '#efe4d7',
      });
    });

    const backBtn = this.add.rectangle(426, 598, 240, 64, 0x2b2326, 0.95)
      .setStrokeStyle(2, 0x8c6c70)
      .setInteractive({ useHandCursor: true });
    this.add.text(426, 598, '返回任务准备', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '26px',
      color: '#f1dde0',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const startBtn = this.add.rectangle(854, 598, 340, 64, 0x5a3a2a, 0.97)
      .setStrokeStyle(2, 0xc4936c)
      .setInteractive({ useHandCursor: true });
    this.add.text(854, 598, '开始补给行动（Enter）', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '28px',
      color: '#fff4e6',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const startMission = (): void => {
      this.scene.start('MissionScene', cfg);
    };
    backBtn.on('pointerdown', () => {
      this.registry.set('openPreparationWindow', true);
      this.scene.start('MainMenuScene');
    });
    startBtn.on('pointerdown', startMission);
    this.input.keyboard?.on('keydown-ENTER', startMission);
  }

  private readConfig(): MissionSetupConfig {
    const fromRegistry = this.registry.get('missionConfig') as MissionSetupConfig | undefined;
    return {
      ...DEFAULT_MISSION_CONFIG,
      ...(fromRegistry ?? {}),
    };
  }
}

class MissionScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerShadow!: Phaser.GameObjects.Ellipse;
  private crosshair!: Phaser.GameObjects.Graphics;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemyGroup!: Phaser.Physics.Arcade.Group;
  private enemies: EnemyUnit[] = [];
  private lootContainers: LootContainer[] = [];
  private npcs: NpcUnit[] = [];
  private obstacleZones: Phaser.GameObjects.Zone[] = [];
  private bushPatches: BushPatch[] = [];
  private stoneGolemSpawned: Record<StoneGolemType, boolean> = {
    crimson_statue: false,
    azure_statue: false,
  };
  private activeStoneGolemType?: StoneGolemType;
  private nextStoneGolemSpawnAt = Number.POSITIVE_INFINITY;

  private hp = 100;
  private stamina = 100;
  private pressure = 0;
  private elapsedMs = 0;
  private missionStartAt = 0;
  private reinforceAt = 17000;

  private weaponSlots: WeaponId[] = ['sniper_rifle'];
  private weaponMags: Record<WeaponId, number> = {
    sniper_rifle: WEAPON_CONFIG.sniper_rifle.magSize,
  };
  private reserveAmmo: Record<AmmoType, number> = {
    sniper: 24,
  };

  private lastFireAt = 0;
  private reloadStartAt = 0;
  private reloadDurationMs = 0;
  private reloadFinishAt = 0;
  private lastInteractAt = 0;
  private lastBagToggleAt = 0;
  private pointerWasDown = false;
  private resultShown = false;
  private skillScanReadyAt = 0;
  private skillSnipeReadyAt = 0;
  private skillDashReadyAt = 0;
  private skillDashEndAt = 0;
  private skillDashDir = new Phaser.Math.Vector2(1, 0);
  private aimDir = new Phaser.Math.Vector2(1, 0);
  private scoutEyes: Array<{ x: number; y: number; expireAt: number; ring: Phaser.GameObjects.Arc }> = [];
  private skillSnipeActiveUntil = 0;
  private playerVisualState: PlayerState = 'idle';
  private playerStateUntil = 0;
  private playerStateLockPriority = 0;
  private audioCtx?: AudioContext;
  private sfxVariantIndex: Record<string, number> = {};
  private eShotSfxWarned = false;

  private inventory: ItemStack[] = [
    { ...getSupplyItem('bandage_roll'), count: 1 },
  ];
  private inventoryCap = 10;
  private activeLoot?: LootContainer;
  private lootPanelOpen = false;

  private objectiveCollected = 0;
  private objectiveNeed = 3;
  private suppliesDelivered = false;
  private missionConfig: MissionSetupConfig = { ...DEFAULT_MISSION_CONFIG };
  private aiAssistantEnabled = true;

  private hudTop!: Phaser.GameObjects.Text;
  private hudHint!: Phaser.GameObjects.Text;
  private hudRisk!: Phaser.GameObjects.Text;
  private skillBoard!: Phaser.GameObjects.Text;
  private npcDialog!: Phaser.GameObjects.Text;
  private npcDialogHideEvent?: Phaser.Time.TimerEvent;
  private banner!: Phaser.GameObjects.Text;
  private bannerHideEvent?: Phaser.Time.TimerEvent;
  private failureDialog?: {
    mask: Phaser.GameObjects.Rectangle;
    panel: Phaser.GameObjects.Rectangle;
    title: Phaser.GameObjects.Text;
    message: Phaser.GameObjects.Text;
    retryBtn: Phaser.GameObjects.Rectangle;
    retryTxt: Phaser.GameObjects.Text;
    homeBtn: Phaser.GameObjects.Rectangle;
    homeTxt: Phaser.GameObjects.Text;
  };
  private settlementDialog?: {
    bg: Phaser.GameObjects.Image;
    dim: Phaser.GameObjects.Rectangle;
    title: Phaser.GameObjects.Text;
    message: Phaser.GameObjects.Text;
    detail: Phaser.GameObjects.Text;
    retryBtn: Phaser.GameObjects.Rectangle;
    retryTxt: Phaser.GameObjects.Text;
    homeBtn: Phaser.GameObjects.Rectangle;
    homeTxt: Phaser.GameObjects.Text;
  };
  private campfireConfirmDialog?: {
    panel: Phaser.GameObjects.Rectangle;
    title: Phaser.GameObjects.Text;
    message: Phaser.GameObjects.Text;
    hint: Phaser.GameObjects.Text;
  };
  private campfireAwaitConfirm = false;
  private dialogueOverlay?: DialogueOverlay;
  private activeDialogueNpc?: NpcUnit;
  private dialogueHistory: Array<{ speaker: string; content: string }> = [];
  private readonly npcDialogueMemory = new Map<string, Array<{ speaker: string; content: string }>>();
  private hudCollapsed = true;
  private hudDecor: Phaser.GameObjects.Rectangle[] = [];
  private hudDetailItems: Phaser.GameObjects.Text[] = [];
  private hudToggleButton!: Phaser.GameObjects.Container;
  private hudToggleLabel!: Phaser.GameObjects.Text;
  private interactionRing!: Phaser.GameObjects.Ellipse;
  private interactionWorldHint!: Phaser.GameObjects.Text;
  private activeInteractionTarget?: {
    type: 'npc' | 'loot' | 'campfire' | 'submit';
    ref: NpcUnit | LootContainer | CampfireStation | SupplySubmitStation;
  };
  private campfireStation?: CampfireStation;
  private supplySubmitStation?: SupplySubmitStation;

  private hotbarSlots: Array<{ box: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text; ammo: Phaser.GameObjects.Text }> = [];

  private lootPanelBg!: Phaser.GameObjects.Rectangle;
  private lootTitle!: Phaser.GameObjects.Text;
  private invHeader!: Phaser.GameObjects.Text;
  private boxHeader!: Phaser.GameObjects.Text;
  private invList: Phaser.GameObjects.Text[] = [];
  private boxList: Phaser.GameObjects.Text[] = [];
  private atmosphereVignette!: Phaser.GameObjects.Graphics;
  private atmosphereFog!: Phaser.GameObjects.Rectangle;
  private fogLayer!: Phaser.GameObjects.RenderTexture;
  private dustEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  private recoveryUseUntil = 0;
  private recoveryUseItemLabel = '';
  private recoveryUseHealAmount = 0;
  private recoveryProgressBar!: Phaser.GameObjects.Graphics;
  private recoveryProgressLabel!: Phaser.GameObjects.Text;
  private reloadProgressBar!: Phaser.GameObjects.Graphics;
  private reloadProgressLabel!: Phaser.GameObjects.Text;

  constructor() {
    super('MissionScene');
  }

  preload(): void {
    this.load.setCORS('anonymous');
    this.load.image('phaser_crate32', 'https://cdn.phaserfiles.com/v385/assets/sprites/crate32.png');
    this.load.image('phaser_mushroom', 'https://cdn.phaserfiles.com/v385/assets/sprites/mushroom2.png');
    this.load.image('phaser_palm', 'https://cdn.phaserfiles.com/v385/assets/sprites/palm-tree-left.png');
    this.load.image('phaser_platform', 'https://cdn.phaserfiles.com/v385/assets/sprites/platform.png');
    this.load.image('official_shouyue', '/assets/official/shouyue.png');
    this.load.image('official_mozhong', '/assets/official/mozhong.png');
    this.load.image('official_supply_box', '/assets/official/supply_box.png');
    this.load.image('official_npc_mulan', '/assets/official/npc_mulan.png');
    this.load.image('official_npc_kai', '/assets/official/npc_kai.png');
    this.load.image('official_npc_xuance', '/assets/official/npc_xuance.png');
    this.load.image('official_desert_bg', '/assets/official/desert_bg.png');
    this.load.image('wilderness_bush_clump', '/assets/custom/grass_clump.png');
    this.load.image('enemy_grunt_blue', '/assets/custom/enemy_grunt_blue.png');
    this.load.image('enemy_grunt_red', '/assets/custom/enemy_grunt_red.png');
    this.load.image('elite_statue_crimson', '/assets/custom/elite_statue_crimson.png');
    this.load.image('elite_statue_azure', '/assets/custom/elite_statue_azure.png');
    this.load.image('rear_camp_tent', '/assets/custom/rear_camp_tent.png');
    this.load.image('campfire_model', '/assets/custom/campfire_station.png');
    this.load.image('mission_result_bg2', '/assets/custom/mission_result_bg2.webp');
    this.load.image('shouyue_state_idle', '/assets/custom/shouyue_idle.png');
    this.load.image('shouyue_state_walk', '/assets/custom/shouyue_walk.png');
    this.load.image('shouyue_state_aim', '/assets/custom/shouyue_snipe_aim.png');
    this.load.image('shouyue_state_fire', '/assets/custom/shouyue_fire_alt.png');
    this.load.image('shouyue_state_hurt', '/assets/custom/shouyue_hurt.png');
    this.load.audio('sfx_shouyue_basic_a', '/assets/audio/shouyue_basic_a.wav');
    this.load.audio('sfx_shouyue_basic_b', '/assets/audio/shouyue_basic_b.wav');
    this.load.audio('sfx_shouyue_snipe_charge_a', '/assets/audio/shouyue_snipe_charge_a.wav');
    this.load.audio('sfx_shouyue_snipe_charge_b', '/assets/audio/shouyue_snipe_charge_b.wav');
    this.load.audio('sfx_shouyue_snipe_fire_a', '/assets/audio/shouyue_snipe_fire_a.wav');
    this.load.audio('sfx_shouyue_snipe_fire_b', '/assets/audio/shouyue_snipe_fire_b.wav');
    this.load.audio('sfx_shouyue_e_shot_a', '/assets/audio/sfx_shouyue_e_shot_a.wav');
    this.load.audio('sfx_shouyue_dash', '/assets/audio/shouyue_dash.wav');
    // 可选第二条变体音效（有文件后再启用）
    // this.load.audio('sfx_shouyue_e_shot_b', '/assets/audio/sfx_shouyue_e_shot_b.wav');
  }

  create(data?: Partial<MissionSetupConfig>): void {
    ensureMenuBgm(this);
    const fromRegistry = this.registry.get('missionConfig') as MissionSetupConfig | undefined;
    this.missionConfig = {
      ...DEFAULT_MISSION_CONFIG,
      ...(fromRegistry ?? {}),
      ...(data ?? {}),
    };
    this.resetMissionRuntimeState();
    this.aiAssistantEnabled = this.missionConfig.aiAssistant;
    this.missionStartAt = this.time.now;
    this.nextStoneGolemSpawnAt = this.missionStartAt + STONE_GOLEM_FIRST_SPAWN_DELAY_MS;

    this.objectiveNeed = getObjectiveNeed(this.missionConfig.mode);
    this.reinforceAt = this.missionConfig.mode === 'pressure' ? 9000 : 12000;

    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    this.createModelTextures();
    this.drawMap();
    this.spawnPlayer();
    this.createObstacleColliders();
    this.spawnEnemies();
    if (this.missionConfig.mode === 'pressure') {
      this.spawnEnemy(1480, 340);
      this.spawnEnemy(1620, 760);
    }
    this.spawnLootContainers();
    this.spawnNpcs();
    this.createUi();
    this.setupCameraAndAtmosphere();
    this.setupInput();
    this.setupCombatOverlap();
    this.playStoryIntro();
  }

  private resetMissionRuntimeState(): void {
    this.hp = 100;
    this.stamina = 100;
    this.pressure = 0;
    this.elapsedMs = 0;
    this.lastFireAt = 0;
    this.reloadStartAt = 0;
    this.reloadDurationMs = 0;
    this.reloadFinishAt = 0;
    this.lastInteractAt = 0;
    this.lastBagToggleAt = 0;
    this.pointerWasDown = false;
    this.resultShown = false;
    this.skillScanReadyAt = 0;
    this.skillSnipeReadyAt = 0;
    this.skillDashReadyAt = 0;
    this.skillDashEndAt = 0;
    this.skillSnipeActiveUntil = 0;
    this.playerVisualState = 'idle';
    this.playerStateUntil = 0;
    this.playerStateLockPriority = 0;
    this.weaponMags = { sniper_rifle: WEAPON_CONFIG.sniper_rifle.magSize };
    this.reserveAmmo = { sniper: 24 };
    this.inventory = [{ ...getSupplyItem('bandage_roll'), count: 1 }];
    this.activeLoot = undefined;
    this.lootPanelOpen = false;
    this.objectiveCollected = 0;
    this.suppliesDelivered = false;
    this.activeDialogueNpc = undefined;
    this.dialogueHistory = [];
    this.npcDialogueMemory.clear();
    this.activeInteractionTarget = undefined;
    this.campfireStation = undefined;
    this.supplySubmitStation = undefined;
    this.sfxVariantIndex = {};
    this.eShotSfxWarned = false;
    this.hudCollapsed = true;
    this.campfireAwaitConfirm = false;
    this.recoveryUseUntil = 0;
    this.recoveryUseItemLabel = '';
    this.recoveryUseHealAmount = 0;
    this.enemies = [];
    this.lootContainers = [];
    this.npcs = [];
    this.obstacleZones = [];
    this.bushPatches = [];
    this.hudDecor = [];
    this.hudDetailItems = [];
    this.hotbarSlots = [];
    this.invList = [];
    this.boxList = [];
    this.stoneGolemSpawned = { crimson_statue: false, azure_statue: false };
    this.activeStoneGolemType = undefined;
    this.nextStoneGolemSpawnAt = Number.POSITIVE_INFINITY;
    this.scoutEyes.forEach((eye) => eye.ring.destroy());
    this.scoutEyes = [];
    this.npcDialogHideEvent?.remove(false);
    this.bannerHideEvent?.remove(false);
    this.failureDialog = undefined;
    this.settlementDialog = undefined;
    this.campfireConfirmDialog = undefined;
    this.dialogueOverlay?.hide();
    this.dialogueOverlay?.clear();
  }

  private createModelTextures(): void {
    if (this.textures.exists('player_model') && this.textures.exists('enemy_boss_model')) return;
    const g = this.add.graphics();

    g.clear();
    g.fillStyle(0x1b3036, 1).fillCircle(16, 16, 14);
    g.fillStyle(0xb9d7c7, 1).fillRoundedRect(10, 8, 12, 16, 4);
    g.fillStyle(0x40565f, 1).fillRect(8, 15, 16, 3);
    g.fillStyle(0xead4aa, 1).fillCircle(16, 24, 3);
    g.generateTexture('player_model', 32, 32);

    g.clear();
    g.fillStyle(0x210d11, 0.95).fillEllipse(18, 21, 26, 28);
    g.fillStyle(0x48151c, 1).fillEllipse(18, 20, 18, 20);
    g.fillStyle(0x7f262d, 1).fillEllipse(18, 18, 12, 10);
    g.fillStyle(0x140507, 1).fillTriangle(5, 13, 10, 2, 14, 13);
    g.fillStyle(0x140507, 1).fillTriangle(31, 13, 26, 2, 22, 13);
    g.fillStyle(0x3b0f14, 1).fillTriangle(6, 27, 1, 18, 12, 22);
    g.fillStyle(0x3b0f14, 1).fillTriangle(30, 27, 35, 18, 24, 22);
    g.fillStyle(0xe9c97f, 1).fillCircle(14, 17, 2);
    g.fillStyle(0xe9c97f, 1).fillCircle(22, 17, 2);
    g.fillStyle(0xb9463f, 1).fillEllipse(18, 27, 8, 5);
    g.fillStyle(0x090304, 0.5).fillEllipse(18, 33, 10, 4);
    g.generateTexture('enemy_grunt_model', 36, 40);

    g.clear();
    g.fillStyle(0x120d10, 1).fillEllipse(22, 25, 34, 34);
    g.fillStyle(0x2d2b30, 1).fillRoundedRect(8, 11, 28, 26, 8);
    g.fillStyle(0x5b2125, 1).fillEllipse(22, 21, 14, 13);
    g.fillStyle(0x0a090b, 1).fillTriangle(7, 18, 13, 4, 18, 18);
    g.fillStyle(0x0a090b, 1).fillTriangle(37, 18, 31, 4, 26, 18);
    g.fillStyle(0x3a3338, 1).fillTriangle(6, 30, 1, 16, 15, 24);
    g.fillStyle(0x3a3338, 1).fillTriangle(38, 30, 43, 16, 29, 24);
    g.fillStyle(0x7a6c63, 1).fillTriangle(10, 32, 4, 40, 16, 35);
    g.fillStyle(0x7a6c63, 1).fillTriangle(34, 32, 40, 40, 28, 35);
    g.fillStyle(0xf3d69a, 1).fillCircle(17, 20, 2);
    g.fillStyle(0xf3d69a, 1).fillCircle(27, 20, 2);
    g.fillStyle(0xc94d42, 1).fillPoint(22, 28, 8);
    g.fillStyle(0x8c5a44, 1).fillRect(12, 32, 20, 4);
    g.generateTexture('enemy_elite_model', 44, 48);

    g.clear();
    g.fillStyle(0x0b0d12, 1).fillEllipse(28, 30, 40, 42);
    g.fillStyle(0x1f2731, 1).fillRoundedRect(10, 12, 36, 34, 10);
    g.fillStyle(0x4d1822, 1).fillEllipse(28, 24, 16, 14);
    g.fillStyle(0x090b10, 1).fillTriangle(10, 18, 17, 3, 22, 18);
    g.fillStyle(0x090b10, 1).fillTriangle(46, 18, 39, 3, 34, 18);
    g.fillStyle(0x1f2731, 1).fillTriangle(8, 38, 2, 18, 18, 25);
    g.fillStyle(0x1f2731, 1).fillTriangle(48, 38, 54, 18, 38, 25);
    g.fillStyle(0x61b4c0, 0.9).fillTriangle(6, 33, 0, 46, 16, 38);
    g.fillStyle(0x61b4c0, 0.9).fillTriangle(50, 33, 56, 46, 40, 38);
    g.fillStyle(0xf4ddb1, 1).fillCircle(22, 24, 2);
    g.fillStyle(0xf4ddb1, 1).fillCircle(34, 24, 2);
    g.fillStyle(0x6fd2d7, 1).fillPoint(28, 31, 10);
    g.fillStyle(0x223340, 1).fillRoundedRect(15, 36, 26, 7, 3);
    g.fillStyle(0x6fd2d7, 0.35).fillEllipse(28, 31, 16, 20);
    g.generateTexture('enemy_boss_model', 56, 58);

    g.clear();
    g.fillStyle(0x4b4e44, 1).fillRoundedRect(3, 5, 26, 22, 4);
    g.fillStyle(0x616659, 1).fillRect(5, 10, 22, 3);
    g.fillStyle(0x383b33, 1).fillRect(5, 16, 22, 3);
    g.generateTexture('crate_model', 32, 32);

    g.clear();
    g.fillStyle(0x727a80, 1).fillRoundedRect(2, 6, 34, 24, 8);
    g.fillStyle(0x5a6168, 1).fillCircle(10, 12, 6);
    g.fillStyle(0x8a9298, 1).fillCircle(24, 14, 7);
    g.fillStyle(0x4b5359, 1).fillRoundedRect(7, 18, 20, 8, 4);
    g.generateTexture('rock_model', 38, 34);

    g.clear();
    g.fillStyle(0x7f613f, 1).fillRect(0, 10, 54, 14);
    g.fillStyle(0x9f7b4f, 1).fillRect(2, 8, 50, 4);
    g.fillStyle(0x5e472f, 1).fillRect(6, 12, 42, 2);
    g.generateTexture('ramp_model', 54, 26);

    g.clear();
    g.fillStyle(0x56753f, 1).fillTriangle(12, 2, 2, 22, 22, 22);
    g.fillStyle(0x6c9250, 1).fillTriangle(12, 6, 5, 20, 19, 20);
    g.fillStyle(0x5f4a2f, 1).fillRect(10, 22, 4, 8);
    g.generateTexture('pine_model', 24, 30);

    g.clear();
    g.fillStyle(0x5e7f53, 1).fillCircle(12, 10, 9);
    g.fillStyle(0x789c69, 1).fillCircle(15, 12, 7);
    g.fillStyle(0x556f4a, 1).fillEllipse(12, 20, 18, 8);
    g.generateTexture('bush_model', 26, 26);

    g.clear();
    g.fillStyle(0x8f6a46, 1).fillRect(2, 2, 42, 30);
    g.fillStyle(0xb08459, 1).fillRect(2, 2, 42, 6);
    g.fillStyle(0x6e5034, 1).fillRect(6, 10, 34, 2);
    g.fillStyle(0x6e5034, 1).fillRect(6, 16, 34, 2);
    g.fillStyle(0x6e5034, 1).fillRect(6, 22, 34, 2);
    g.generateTexture('container_yellow', 46, 34);

    g.clear();
    g.fillStyle(0x6f3a32, 1).fillRect(2, 2, 42, 30);
    g.fillStyle(0x8f4a3f, 1).fillRect(2, 2, 42, 6);
    g.fillStyle(0x512620, 1).fillRect(6, 10, 34, 2);
    g.fillStyle(0x512620, 1).fillRect(6, 16, 34, 2);
    g.fillStyle(0x512620, 1).fillRect(6, 22, 34, 2);
    g.generateTexture('container_red', 46, 34);

    g.clear();
    g.fillStyle(0x6f5e46, 1).fillRect(14, 8, 8, 42);
    g.fillStyle(0x7f6d54, 1).fillRect(6, 8, 24, 4);
    g.fillStyle(0x97a8ad, 1).fillRect(8, 2, 20, 8);
    g.fillStyle(0x5d4e3a, 1).fillRect(10, 18, 16, 2);
    g.fillStyle(0x5d4e3a, 1).fillRect(10, 26, 16, 2);
    g.fillStyle(0x5d4e3a, 1).fillRect(10, 34, 16, 2);
    g.generateTexture('tower_model', 36, 54);

    if (!this.textures.exists('campfire_model')) {
      g.clear();
      g.fillStyle(0x4f3526, 1).fillRect(8, 24, 24, 8);
      g.fillStyle(0x6f4b34, 1).fillRect(6, 20, 12, 5);
      g.fillStyle(0x6f4b34, 1).fillRect(22, 20, 12, 5);
      g.fillStyle(0xffb365, 0.95).fillTriangle(20, 21, 14, 9, 26, 9);
      g.fillStyle(0xffdc87, 0.78).fillTriangle(20, 18, 16, 11, 24, 11);
      g.fillStyle(0xffe9b3, 0.6).fillTriangle(20, 15, 18, 12, 22, 12);
      g.generateTexture('campfire_model', 40, 40);
    }

    g.clear();
    g.fillStyle(0x7f9156, 1).fillRoundedRect(2, 4, 20, 14, 3);
    g.fillStyle(0x4e5e35, 1).fillRect(4, 7, 16, 2);
    g.generateTexture('food_model', 24, 24);

    g.clear();
    g.fillStyle(0xb59467, 1).fillEllipse(16, 16, 28, 22);
    g.fillStyle(0xd1b07c, 1).fillEllipse(17, 13, 20, 11);
    g.fillStyle(0x866443, 1).fillRect(14, 6, 4, 8);
    g.generateTexture('grain_sack_model', 32, 28);

    g.clear();
    g.fillStyle(0x5d7f6a, 1).fillRoundedRect(2, 3, 20, 16, 2);
    g.fillStyle(0xc4d4c8, 1).fillRect(10, 5, 4, 12);
    g.fillStyle(0xc4d4c8, 1).fillRect(6, 9, 12, 4);
    g.generateTexture('med_model', 24, 24);

    g.clear();
    g.fillStyle(0x3f665c, 1).fillRoundedRect(2, 4, 30, 20, 4);
    g.fillStyle(0xdcece7, 1).fillRect(14, 8, 6, 12);
    g.fillStyle(0xdcece7, 1).fillRect(11, 11, 12, 6);
    g.fillStyle(0x1e3833, 1).fillRect(6, 16, 22, 2);
    g.generateTexture('medical_crate_model', 34, 28);

    g.clear();
    g.fillStyle(0x7a7f87, 1).fillRoundedRect(3, 4, 18, 14, 2);
    g.fillStyle(0x4a4f57, 1).fillRect(5, 8, 14, 2);
    g.fillStyle(0x4a4f57, 1).fillRect(5, 12, 14, 2);
    g.generateTexture('part_model', 24, 24);

    g.clear();
    g.fillStyle(0x6b553a, 1).fillRoundedRect(2, 4, 30, 18, 3);
    g.fillStyle(0xcfaa6d, 1).fillRect(6, 9, 20, 2);
    g.fillStyle(0xcfaa6d, 1).fillRect(6, 13, 16, 2);
    g.fillStyle(0x3d2a1a, 1).fillRect(8, 6, 2, 14);
    g.fillStyle(0x3d2a1a, 1).fillRect(24, 6, 2, 14);
    g.generateTexture('ammo_crate_model', 34, 26);

    g.clear();
    g.fillStyle(0x4b6075, 1).fillRoundedRect(2, 6, 30, 18, 4);
    g.fillStyle(0x8ca0b8, 1).fillRect(10, 4, 14, 4);
    g.fillStyle(0x253545, 1).fillRect(7, 12, 20, 2);
    g.fillStyle(0x253545, 1).fillRect(7, 16, 20, 2);
    g.generateTexture('tool_box_model', 34, 28);

    g.clear();
    g.fillStyle(0x7c5b3a, 1).fillRect(2, 10, 44, 10);
    g.fillStyle(0x4e3924, 1).fillCircle(12, 24, 7);
    g.fillStyle(0x4e3924, 1).fillCircle(34, 24, 7);
    g.fillStyle(0x9f784f, 1).fillRect(10, 6, 28, 4);
    g.fillStyle(0x5b4330, 1).fillRect(22, 2, 4, 12);
    g.generateTexture('wagon_wreck_model', 48, 32);

    g.clear();
    g.fillStyle(0x6b573d, 1).fillTriangle(4, 22, 18, 6, 30, 22);
    g.fillStyle(0x4b3725, 1).fillRect(7, 18, 20, 3);
    g.fillStyle(0x9d7a52, 0.88).fillTriangle(8, 20, 18, 9, 27, 20);
    g.generateTexture('tent_ruin_model', 34, 24);

    g.clear();
    g.fillStyle(0xd9d3b1, 1).fillCircle(4, 4, 3);
    g.generateTexture('bullet_model', 8, 8);

    g.clear();
    for (let i = 9; i >= 1; i -= 1) {
      g.fillStyle(0xffffff, 0.08 + i * 0.035).fillCircle(128, 128, i * 14);
    }
    g.generateTexture('fog_reveal', 256, 256);

    g.clear();
    g.fillStyle(0x4b2330, 1).fillCircle(16, 16, 15);
    g.fillStyle(0xa31d42, 1).fillEllipse(17, 10, 18, 12);
    g.fillStyle(0xd84a57, 1).fillTriangle(22, 8, 29, 4, 27, 14);
    g.fillStyle(0xf1c98f, 1).fillCircle(15, 13, 6);
    g.fillStyle(0xf0bf56, 1).fillTriangle(11, 9, 20, 8, 16, 3);
    g.fillStyle(0x6e1d2a, 1).fillRoundedRect(7, 16, 18, 10, 4);
    g.fillStyle(0x8f2e3f, 1).fillRect(10, 24, 14, 4);
    g.fillStyle(0xcba97b, 0.85).fillRect(7, 27, 18, 2);
    g.generateTexture('npc_mulan', 32, 32);

    g.clear();
    g.fillStyle(0x2c4f6a, 1).fillCircle(16, 16, 14);
    g.fillStyle(0xd6c39e, 1).fillCircle(16, 10, 5);
    g.fillStyle(0x4b718c, 1).fillRect(9, 15, 14, 11);
    g.fillStyle(0x8cb4cf, 1).fillRect(6, 24, 20, 4);
    g.generateTexture('npc_kai', 32, 32);

    g.clear();
    g.fillStyle(0x4b3e75, 1).fillCircle(16, 16, 14);
    g.fillStyle(0xd6bfa0, 1).fillCircle(16, 10, 5);
    g.fillStyle(0x695b96, 1).fillRect(9, 15, 14, 11);
    g.fillStyle(0x9f93c4, 1).fillRect(6, 24, 20, 4);
    g.generateTexture('npc_xuance', 32, 32);

    g.clear();
    g.fillStyle(0x71472a, 1).fillRect(0, 0, 64, 64);
    const wastelandPalette = [0x6a4228, 0x7a4d2e, 0x845433, 0x915e39, 0x5e3a22];
    for (let y = 0; y < 64; y += 4) {
      for (let x = 0; x < 64; x += 4) {
        const idx = ((x / 4) * 5 + (y / 4) * 3 + Math.floor((x + y) / 16)) % wastelandPalette.length;
        g.fillStyle(wastelandPalette[idx], 1).fillRect(x, y, 4, 4);
      }
    }
    g.fillStyle(0xa97347, 0.4);
    for (let y = 6; y < 64; y += 14) {
      g.fillRect(0, y, 64, 2);
    }
    g.fillStyle(0x513320, 0.34);
    for (let y = 12; y < 64; y += 14) {
      g.fillRect(0, y, 64, 1);
    }
    g.fillStyle(0xc69262, 0.48);
    for (let i = 0; i < 18; i += 1) {
      const px = 2 + ((i * 11) % 58);
      const py = 3 + ((i * 7) % 58);
      g.fillRect(px, py, 2, 2);
    }
    g.generateTexture('terrain_wasteland_tile', 64, 64);

    g.clear();
    g.fillStyle(0x603e27, 1).fillRect(0, 0, 64, 64);
    const badlandPalette = [0x573821, 0x674229, 0x754b2f, 0x87583a, 0x4c321d];
    for (let y = 0; y < 64; y += 4) {
      for (let x = 0; x < 64; x += 4) {
        const ridge = y > 34 ? 2 : 0;
        const idx = ((x / 4) * 7 + (y / 4) * 2 + ridge) % badlandPalette.length;
        g.fillStyle(badlandPalette[idx], 1).fillRect(x, y, 4, 4);
      }
    }
    g.fillStyle(0x3f2818, 0.55);
    for (let i = 0; i < 7; i += 1) {
      const y = 7 + i * 8;
      const x = (i % 2) * 6;
      g.fillRect(x, y, 30, 1);
      g.fillRect(x + 24, y + 2, 20, 1);
    }
    g.fillStyle(0x9b6a44, 0.4);
    for (let i = 0; i < 14; i += 1) {
      const px = 4 + ((i * 9) % 56);
      const py = 5 + ((i * 13) % 54);
      g.fillRect(px, py, 3, 2);
    }
    g.generateTexture('terrain_badland_tile', 64, 64);

    g.clear();
    g.fillStyle(0x74614e, 1).fillRect(0, 0, 48, 48);
    const fortressPalette = [0x796654, 0x7f6a57, 0x85705c, 0x715f4d];
    for (let y = 0; y < 48; y += 12) {
      const offset = (y / 12 % 2) * 6;
      for (let x = -6; x < 48; x += 12) {
        const idx = ((x + 6) / 6 + y / 12) % fortressPalette.length;
        g.fillStyle(fortressPalette[idx], 1).fillRect(x + offset, y, 12, 12);
      }
    }
    g.fillStyle(0x4f4338, 0.38);
    for (let y = 11; y < 48; y += 12) g.fillRect(0, y, 48, 1);
    g.fillStyle(0xb9a68f, 0.25).fillRect(0, 0, 48, 1);
    g.fillStyle(0xffffff, 0.05).fillRect(0, 1, 48, 1);
    g.generateTexture('fortress_floor_tile', 48, 48);

    g.clear();
    g.fillStyle(0x886e57, 1).fillRect(0, 0, 48, 48);
    const wallPalette = [0x8d735a, 0x92775d, 0x987d63, 0x816952];
    for (let y = 0; y < 48; y += 12) {
      const offset = (y / 12 % 2) * 6;
      for (let x = -6; x < 48; x += 12) {
        const idx = ((x + 6) / 6 + (y / 12) * 2) % wallPalette.length;
        g.fillStyle(wallPalette[idx], 1).fillRect(x + offset, y, 12, 12);
      }
    }
    g.fillStyle(0x544536, 0.42);
    for (let y = 11; y < 48; y += 12) g.fillRect(0, y, 48, 1);
    for (let x = 11; x < 48; x += 12) g.fillRect(x, 0, 1, 48);
    g.fillStyle(0xcfbb9f, 0.22).fillRect(0, 0, 48, 2);
    g.fillStyle(0x473a2e, 0.2).fillRect(0, 46, 48, 2);
    g.generateTexture('fortress_wall_tile', 48, 48);

    g.clear();
    g.fillStyle(0x84705a, 1).fillRect(0, 0, 64, 64);
    const plazaPalette = [0x8a7560, 0x907a64, 0x967f69, 0x7d6a56];
    for (let y = 0; y < 64; y += 16) {
      const offset = (y / 16 % 2) * 8;
      for (let x = -8; x < 64; x += 16) {
        const idx = ((x + 8) / 8 + y / 16) % plazaPalette.length;
        g.fillStyle(plazaPalette[idx], 1).fillRect(x + offset, y, 16, 16);
      }
    }
    g.fillStyle(0x5a4b3d, 0.4);
    for (let y = 15; y < 64; y += 16) g.fillRect(0, y, 64, 1);
    for (let x = 15; x < 64; x += 16) g.fillRect(x, 0, 1, 64);
    g.fillStyle(0xd8c4a8, 0.14).fillRect(0, 0, 64, 1);
    g.fillStyle(0xffffff, 0.04).fillRect(0, 1, 64, 1);
    g.generateTexture('fortress_plaza_tile', 64, 64);

    g.clear();
    g.fillStyle(0x8f7860, 1).fillRect(0, 0, 96, 96);
    const cityPathPalette = [0x957d64, 0x9b8269, 0xa0886e, 0x8a745d];
    for (let y = 0; y < 96; y += 16) {
      const offset = (y / 16 % 2) * 8;
      for (let x = -8; x < 96; x += 16) {
        const idx = ((x + 8) / 8 + y / 16) % cityPathPalette.length;
        g.fillStyle(cityPathPalette[idx], 1).fillRect(x + offset, y, 16, 16);
      }
    }
    g.fillStyle(0x5d4d3f, 0.32);
    for (let y = 15; y < 96; y += 16) g.fillRect(0, y, 96, 1);
    for (let x = 15; x < 96; x += 16) g.fillRect(x, 0, 1, 96);
    g.fillStyle(0xe5d2b8, 0.12).fillRect(0, 0, 96, 1);
    g.generateTexture('fortress_path_tile', 96, 96);

    g.clear();
    g.fillStyle(0x5f422e, 0.0).fillRect(0, 0, 128, 128);
    g.fillStyle(0x3f2a1c, 0.3);
    for (let i = 0; i < 8; i += 1) {
      const y = 14 + i * 14;
      const offset = i % 2 === 0 ? 0 : 6;
      g.fillRect(10 + offset, y, 40, 2);
      g.fillRect(74 + offset, y + 1, 40, 2);
    }
    g.fillStyle(0x8e6646, 0.22);
    for (let i = 0; i < 10; i += 1) {
      const y = 8 + i * 12;
      g.fillRect(20 + (i % 3) * 3, y, 30, 1);
      g.fillRect(82 + (i % 2) * 2, y + 2, 26, 1);
    }
    g.fillStyle(0xc19264, 0.24);
    for (let i = 0; i < 16; i += 1) {
      const px = 6 + ((i * 15) % 118);
      const py = 4 + ((i * 11) % 120);
      g.fillRect(px, py, 2, 2);
    }
    g.generateTexture('road_ruts_tile', 128, 128);

    g.clear();
    g.fillStyle(0x000000, 0).fillRect(0, 0, 48, 48);
    g.fillStyle(0x3f3126, 0.24);
    for (let i = 0; i < 4; i += 1) {
      const y = 7 + i * 11;
      g.fillRect(6 + (i % 2), y, 14, 1);
      g.fillRect(24 + (i % 3), y + 2, 12, 1);
    }
    g.fillStyle(0x5f4b3b, 0.14);
    g.fillRect(10, 12, 1, 16);
    g.fillRect(30, 18, 1, 14);
    g.generateTexture('fortress_crack_tile', 48, 48);

    g.clear();
    g.fillStyle(0x3d2b1d, 1).fillRect(2, 2, 4, 44);
    g.fillStyle(0x5b402b, 1).fillRect(3, 2, 1, 44);
    g.fillStyle(0x8a2b20, 1).fillRect(8, 8, 18, 14);
    g.fillStyle(0xb23f2d, 1).fillRect(8, 8, 12, 3);
    g.fillStyle(0xd18f61, 0.95).fillRect(11, 12, 8, 2);
    g.fillStyle(0x8a2b20, 1).fillRect(8, 23, 14, 8);
    g.fillStyle(0xb23f2d, 1).fillRect(8, 23, 9, 2);
    g.fillStyle(0xd18f61, 0.95).fillRect(10, 26, 6, 1);
    g.generateTexture('guard_banner_tile', 32, 48);

    g.destroy();
  }

  private drawMap(): void {
    this.cameras.main.setBackgroundColor('#2a170f');
    if (this.textures.exists('official_desert_bg')) {
      this.add.tileSprite(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 'official_desert_bg').setDepth(0).setAlpha(0.06);
    }

    const g = this.add.graphics();
    const gateY = FORTRESS_TOP;
    const fortressCenterX = (FORTRESS_LEFT + FORTRESS_RIGHT) * 0.5;
    const fortressCenterY = (FORTRESS_TOP + FORTRESS_BOTTOM) * 0.5;
    const fortressInnerW = FORTRESS_RIGHT - FORTRESS_LEFT - 64;
    const fortressInnerH = FORTRESS_BOTTOM - FORTRESS_TOP - 64;
    const rearCampZoneW = 860;
    const rearCampZoneH = 380;
    const rearCampX = FORTRESS_LEFT + 36 + rearCampZoneW * 0.5;
    const rearCampY = 2140;
    const rearCampLabelX = rearCampX - rearCampZoneW * 0.5 + 190;

    if (this.textures.exists('terrain_wasteland_tile')) {
      this.add.tileSprite(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 'terrain_wasteland_tile')
        .setDepth(0.08)
        .setAlpha(0.95);
    }
    if (this.textures.exists('terrain_badland_tile')) {
      this.add.tileSprite(WORLD_WIDTH / 2, 980, WORLD_WIDTH, 1060, 'terrain_badland_tile')
        .setDepth(0.2)
        .setAlpha(0.46)
        .setTint(0xbd8650);
      this.add.tileSprite(2500, 1360, 2060, 620, 'terrain_badland_tile')
        .setDepth(0.22)
        .setAlpha(0.34)
        .setTint(0xa27043);
      this.add.tileSprite(WORLD_WIDTH / 2, 2040, WORLD_WIDTH, 980, 'terrain_badland_tile')
        .setDepth(0.24)
        .setAlpha(0.38)
        .setTint(0x98673d);
      this.add.tileSprite(GATE_X + 470, FORTRESS_TOP - 118, 1180, 220, 'terrain_badland_tile')
        .setDepth(2.35)
        .setAlpha(0.13)
        .setTint(0xbf8b5c);
      this.add.ellipse(GATE_X + 390, FORTRESS_TOP - 108, 1320, 230, 0xe4c8a7, 0.05).setDepth(2.34);
    }
    if (this.textures.exists('road_ruts_tile') || this.textures.exists('fortress_path_tile')) {
      const routeSegments = [
        { x: rearCampX + 120, y: rearCampY - 150, w: 520, h: 128, angle: -13, alpha: 0.28, tint: 0xb79a7d, depth: 2.88, texture: 'fortress_path_tile' },
        { x: 1220, y: 1830, w: 640, h: 132, angle: -21, alpha: 0.26, tint: 0xb29576, depth: 2.8, texture: 'fortress_path_tile' },
        { x: GATE_X + 68, y: FORTRESS_TOP + 110, w: 280, h: 124, angle: -90, alpha: 0.24, tint: 0xab8f73, depth: 2.9, texture: 'fortress_path_tile' },
        { x: 1260, y: 1440, w: 860, h: 124, angle: -18, alpha: 0.3, tint: 0x8b5d3d, depth: 2.34, texture: 'road_ruts_tile' },
        { x: 2070, y: 1240, w: 920, h: 132, angle: -10, alpha: 0.28, tint: 0x855a39, depth: 2.32, texture: 'road_ruts_tile' },
      ];
      routeSegments.forEach((segment) => {
        const textureKey = this.textures.exists(segment.texture) ? segment.texture : 'road_ruts_tile';
        if (!this.textures.exists(textureKey)) return;
        this.add.tileSprite(segment.x, segment.y, segment.w, segment.h, textureKey)
          .setDepth(segment.depth)
          .setAlpha(segment.alpha)
          .setTint(segment.tint)
          .setAngle(segment.angle);
      });
    }

    g.fillStyle(0x28150d, 0.58).fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    g.fillStyle(0x4f2617, 0.8).fillRect(0, 0, WORLD_WIDTH, 380);
    g.fillStyle(0x6e3920, 0.62).fillRect(0, 380, WORLD_WIDTH, 240);
    g.fillStyle(0xffbc69, 0.16).fillEllipse(620, 220, 980, 320);
    g.fillStyle(0xf9d087, 0.08).fillEllipse(620, 220, 620, 180);
    g.fillStyle(0x683820, 0.54).fillEllipse(560, 640, 1400, 280);
    g.fillStyle(0x5b311d, 0.56).fillEllipse(1960, 620, 1800, 320);
    g.fillStyle(0x4b2818, 0.56).fillEllipse(3320, 700, 2100, 380);

    g.fillStyle(0x855331, 0.56).fillRect(0, 620, WORLD_WIDTH, WORLD_HEIGHT - 620);
    g.fillStyle(0x9d6a3f, 0.58).fillEllipse(520, 2100, 1800, 520);
    g.fillStyle(0x8f5f38, 0.56).fillEllipse(1700, 1980, 2400, 600);
    g.fillStyle(0x7a4e2f, 0.58).fillEllipse(3320, 1920, 2400, 720);
    g.fillStyle(0xc08b56, 0.28).fillEllipse(1160, 1760, 1320, 260);
    g.fillStyle(0xd3a56b, 0.21).fillEllipse(2500, 1540, 1800, 320);
    g.fillStyle(0xb07a47, 0.15).fillEllipse(760, 1260, 880, 160);
    g.fillStyle(0xb07a47, 0.13).fillEllipse(1780, 1220, 1180, 180);
    g.fillStyle(0xb07a47, 0.12).fillEllipse(2960, 1140, 1260, 220);
    g.fillStyle(0x5c3822, 0.14).fillEllipse(2320, 1820, 1420, 260);
    g.fillStyle(0x5c3822, 0.12).fillEllipse(3440, 2140, 1180, 240);

    if (this.textures.exists('fortress_floor_tile')) {
      this.add.tileSprite(fortressCenterX, fortressCenterY, fortressInnerW, fortressInnerH, 'fortress_floor_tile')
        .setDepth(2.75)
        .setAlpha(0.9)
        .setTint(0xc8baa6);
      this.add.tileSprite(fortressCenterX, fortressCenterY + 40, fortressInnerW - 120, fortressInnerH - 150, 'fortress_floor_tile')
        .setDepth(2.78)
        .setAlpha(0.56)
        .setTint(0xd1c3af);
    }
    if (this.textures.exists('fortress_plaza_tile')) {
      this.add.tileSprite(fortressCenterX, fortressCenterY + 22, fortressInnerW - 150, fortressInnerH - 190, 'fortress_plaza_tile')
        .setDepth(2.84)
        .setAlpha(0.7)
        .setTint(0xcab8a3);
      this.add.tileSprite(fortressCenterX, FORTRESS_TOP + 170, fortressInnerW - 90, 230, 'fortress_plaza_tile')
        .setDepth(2.86)
        .setAlpha(0.64)
        .setTint(0xd7c8b4);
      this.add.tileSprite(rearCampX, rearCampY, rearCampZoneW - 30, rearCampZoneH - 24, 'fortress_plaza_tile')
        .setDepth(3.02)
        .setAlpha(0.56)
        .setTint(0xcdbda8);
    }
    g.fillStyle(0x6c543f, 0.18).fillRoundedRect(FORTRESS_LEFT + 40, FORTRESS_TOP + 90, FORTRESS_RIGHT - FORTRESS_LEFT - 80, FORTRESS_BOTTOM - FORTRESS_TOP - 150, 18);
    g.fillStyle(0x4f3f31, 0.14).fillRoundedRect(FORTRESS_LEFT + 120, FORTRESS_TOP + 150, FORTRESS_RIGHT - FORTRESS_LEFT - 240, FORTRESS_BOTTOM - FORTRESS_TOP - 250, 18);
    g.fillStyle(0xaa7f53, 0.74).fillRoundedRect(FORTRESS_LEFT + 120, FORTRESS_BOTTOM - 180, FORTRESS_RIGHT - FORTRESS_LEFT - 240, 74, 18);
    g.fillStyle(0xd4ad76, 0.24).fillRect(FORTRESS_LEFT + 180, FORTRESS_BOTTOM - 154, FORTRESS_RIGHT - FORTRESS_LEFT - 360, 16);

    g.fillStyle(0x5b4330, 0.62).fillRect(FORTRESS_LEFT - 26, FORTRESS_TOP - 34, FORTRESS_RIGHT - FORTRESS_LEFT + 52, 34);
    g.fillStyle(0x5b4330, 0.62).fillRect(FORTRESS_LEFT - 26, FORTRESS_BOTTOM, FORTRESS_RIGHT - FORTRESS_LEFT + 52, 34);
    g.fillStyle(0x5b4330, 0.62).fillRect(FORTRESS_LEFT - 34, FORTRESS_TOP - 26, 34, FORTRESS_BOTTOM - FORTRESS_TOP + 52);
    g.fillStyle(0x5b4330, 0.62).fillRect(FORTRESS_RIGHT, FORTRESS_TOP - 26, 34, FORTRESS_BOTTOM - FORTRESS_TOP + 52);
    g.fillStyle(0xbe9b67, 0.64).fillRect(FORTRESS_LEFT - 26, FORTRESS_TOP - 18, GATE_X - GATE_WIDTH * 0.5 - FORTRESS_LEFT + 26, 10);
    g.fillStyle(0xbe9b67, 0.64).fillRect(GATE_X + GATE_WIDTH * 0.5, FORTRESS_TOP - 18, FORTRESS_RIGHT - (GATE_X + GATE_WIDTH * 0.5) + 26, 10);
    g.fillStyle(0x7f6144, 0.74).fillRect(GATE_X - 96, FORTRESS_TOP - 170, 192, 170);
    g.fillStyle(0x9b7650, 0.7).fillRoundedRect(GATE_X - 116, FORTRESS_TOP - 42, 232, 52, 10);
    g.fillStyle(0x493123, 0.72).fillRect(GATE_X - 78, FORTRESS_TOP - 138, 24, 96);
    g.fillStyle(0x493123, 0.72).fillRect(GATE_X + 54, FORTRESS_TOP - 138, 24, 96);
    g.fillStyle(0xe6c78f, 0.28).fillRect(GATE_X - 24, FORTRESS_TOP - 126, 48, 20);
    g.fillStyle(0xae7f4e, 0.52).fillRect(GATE_X - 54, FORTRESS_TOP + 8, 108, GATE_INNER_DEPTH - 48);

    if (!this.textures.exists('fortress_wall_tile')) {
      for (let x = FORTRESS_LEFT + 14; x < FORTRESS_RIGHT; x += 58) {
        if (Math.abs(x - GATE_X) < GATE_WIDTH * 0.65) continue;
        this.add.rectangle(x, FORTRESS_TOP - 24, 22, 18, 0x8f6c49, 1).setDepth(6);
        this.add.rectangle(x, FORTRESS_BOTTOM + 24, 22, 18, 0x8f6c49, 1).setDepth(6);
      }
      for (let y = FORTRESS_TOP + 40; y < FORTRESS_BOTTOM; y += 62) {
        this.add.rectangle(FORTRESS_LEFT - 24, y, 18, 22, 0x8f6c49, 1).setDepth(6);
        this.add.rectangle(FORTRESS_RIGHT + 24, y, 18, 22, 0x8f6c49, 1).setDepth(6);
      }
    }

    const beaconPoints = [
      { x: FORTRESS_LEFT + 120, y: FORTRESS_TOP - 90, glow: 0xffb962 },
      { x: GATE_X, y: FORTRESS_TOP - 110, glow: 0xffaa57 },
      { x: FORTRESS_RIGHT - 120, y: FORTRESS_TOP - 90, glow: 0xffb962 },
      { x: 2680, y: 820, glow: 0xff9242 },
      { x: 3380, y: 980, glow: 0xff9242 },
    ];
    beaconPoints.forEach((point) => {
      this.add.ellipse(point.x, point.y + 18, 36, 12, 0x000000, 0.24).setDepth(3);
      this.add.rectangle(point.x, point.y, 18, 58, 0x564131).setDepth(6);
      this.add.ellipse(point.x, point.y - 24, 58, 36, point.glow, 0.18).setDepth(7);
      this.add.ellipse(point.x, point.y - 22, 28, 20, point.glow, 0.55).setDepth(8);
    });

    const outposts = [
      { x: 2380, y: 1120, scale: 1.2 },
      { x: 3110, y: 920, scale: 1.3 },
      { x: 3520, y: 1560, scale: 1.08 },
    ];
    outposts.forEach((p) => {
      this.add.image(p.x, p.y, 'tower_model').setDepth(6).setScale(p.scale).setTint(0x7b5a3e);
      this.add.ellipse(p.x, p.y + 28, 38, 12, 0x000000, 0.24).setDepth(3);
    });

    if (this.textures.exists('guard_banner_tile')) {
      const bannerSpots = [
        { x: GATE_X - 144, y: FORTRESS_TOP - 150, scale: 1.06, flip: false, tint: 0xf4c388 },
        { x: GATE_X + 144, y: FORTRESS_TOP - 150, scale: 1.06, flip: true, tint: 0xf4c388 },
        { x: FORTRESS_LEFT + 106, y: FORTRESS_TOP - 108, scale: 0.92, flip: false, tint: 0xddab77 },
        { x: FORTRESS_RIGHT - 106, y: FORTRESS_TOP - 108, scale: 0.92, flip: true, tint: 0xddab77 },
        { x: 2394, y: 1068, scale: 0.8, flip: false, tint: 0xcf9f72 },
        { x: 3126, y: 870, scale: 0.84, flip: true, tint: 0xcf9f72 },
      ];
      bannerSpots.forEach((spot) => {
        this.add.image(spot.x, spot.y, 'guard_banner_tile')
          .setDepth(9)
          .setScale(spot.scale)
          .setFlipX(spot.flip)
          .setTint(spot.tint);
      });
    }

    this.add.rectangle(rearCampX, rearCampY, rearCampZoneW, rearCampZoneH, 0x5f4a37, 0.16).setStrokeStyle(2, 0xc79b6d, 0.3).setDepth(3);
    this.add.text(rearCampLabelX, 1940, '后方营地', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '24px',
      color: '#d8e9da',
    }).setOrigin(0.5, 0).setDepth(WORLD_LABEL_DEPTH);
    if (this.textures.exists('rear_camp_tent')) {
      const tent = this.add.image(rearCampLabelX, 2148, 'rear_camp_tent')
        .setDepth(WORLD_LABEL_DEPTH - 1)
        .setAlpha(0.95)
        .setFlipX(true);
      const sourceWidth = tent.width > 0 ? tent.width : 1;
      const sourceHeight = tent.height > 0 ? tent.height : 1;
      const targetWidth = 440;
      const targetHeight = Math.max(80, Math.round((sourceHeight / sourceWidth) * targetWidth));
      tent.setDisplaySize(targetWidth, targetHeight);
    }
    this.add.text(GATE_X, gateY - 140, '唯一城门 · 回城通道', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '24px',
      color: '#f3dfb4',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(WORLD_LABEL_DEPTH);
    this.add.text(2330, 1330, '外围补给区\n军粮 / 药材 / 军械散点', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '20px',
      color: '#ead4ab',
      lineSpacing: 8,
    }).setDepth(WORLD_LABEL_DEPTH);
    this.add.text(3440, 1710, '魔种洗劫区\n残存稀少 · 高危巡逻', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '20px',
      color: '#efbf96',
      lineSpacing: 8,
    }).setDepth(WORLD_LABEL_DEPTH);

    this.drawWorldBoundaryWalls();
    this.drawWallOccluders();
    this.decorateSceneProps();
  }

  private drawWorldBoundaryWalls(): void {
    const thickness = MAP_EDGE_WALL_THICKNESS;
    const half = thickness * 0.5;
    const hasWallTexture = this.textures.exists('fortress_wall_tile');
    const hasWallDamage = this.textures.exists('fortress_crack_tile');

    const setDepth = (obj: Phaser.GameObjects.Rectangle | Phaser.GameObjects.TileSprite): void => {
      obj.setDepth(210 + obj.y);
    };

    const addSegment = (
      x: number,
      y: number,
      w: number,
      h: number,
      tint: number,
      alpha = 1,
    ): void => {
      if (hasWallTexture) {
        const tile = this.add.tileSprite(x, y, w, h, 'fortress_wall_tile').setTint(tint).setAlpha(alpha);
        setDepth(tile);
        if (hasWallDamage) {
          const crack = this.add.tileSprite(x, y, w, h, 'fortress_crack_tile')
            .setTint(0x5c3d29)
            .setAlpha(0.1);
          setDepth(crack);
        }
        return;
      }

      const rect = this.add.rectangle(x, y, w, h, tint, alpha);
      setDepth(rect);
    };

    addSegment(WORLD_WIDTH * 0.5, half, WORLD_WIDTH, thickness, 0xb58a5f, 0.98);
    addSegment(WORLD_WIDTH * 0.5, WORLD_HEIGHT - half, WORLD_WIDTH, thickness, 0xa1764f, 0.98);
    addSegment(half, WORLD_HEIGHT * 0.5, thickness, WORLD_HEIGHT, 0xad8258, 0.98);
    addSegment(WORLD_WIDTH - half, WORLD_HEIGHT * 0.5, thickness, WORLD_HEIGHT, 0xad8258, 0.98);

    for (let x = 34; x < WORLD_WIDTH - 34; x += 56) {
      const topCrenel = this.add.rectangle(x, half - 16, 20, 14, 0xcb9b6b, 0.96);
      const bottomCrenel = this.add.rectangle(x, WORLD_HEIGHT - half + 16, 20, 14, 0xba8a5f, 0.96);
      setDepth(topCrenel);
      setDepth(bottomCrenel);
    }

    for (let y = 36; y < WORLD_HEIGHT - 36; y += 58) {
      const leftCrenel = this.add.rectangle(half - 16, y, 14, 20, 0xc59869, 0.94);
      const rightCrenel = this.add.rectangle(WORLD_WIDTH - half + 16, y, 14, 20, 0xc59869, 0.94);
      setDepth(leftCrenel);
      setDepth(rightCrenel);
    }
  }

  private getFortressWallLayout(): {
    topY: number;
    bottomY: number;
    leftX: number;
    rightX: number;
    fullWallWidth: number;
    gateLeftEdge: number;
    gateRightEdge: number;
    topWallLeftWidth: number;
    topWallRightWidth: number;
  } {
    const topY = FORTRESS_TOP - 17;
    const bottomY = FORTRESS_BOTTOM + 17;
    const leftX = FORTRESS_LEFT - 17;
    const rightX = FORTRESS_RIGHT + 17;
    const fullWallWidth = FORTRESS_RIGHT - FORTRESS_LEFT + 52;
    const gateLeftEdge = GATE_X - GATE_WIDTH * 0.5;
    const gateRightEdge = GATE_X + GATE_WIDTH * 0.5;
    const topWallLeftWidth = gateLeftEdge - (FORTRESS_LEFT - 26);
    const topWallRightWidth = (FORTRESS_RIGHT + 26) - gateRightEdge;

    return {
      topY,
      bottomY,
      leftX,
      rightX,
      fullWallWidth,
      gateLeftEdge,
      gateRightEdge,
      topWallLeftWidth,
      topWallRightWidth,
    };
  }

  private drawWallOccluders(): void {
    const wallColor = 0x5b4330;
    const crenelColor = 0x8f6c49;
    const wallDepthBias = 205;
    const wall = this.getFortressWallLayout();
    const hasWallTexture = this.textures.exists('fortress_wall_tile');
    const hasWallDamage = this.textures.exists('fortress_crack_tile');

    const setWallDepth = (obj: Phaser.GameObjects.Rectangle | Phaser.GameObjects.TileSprite): void => {
      obj.setDepth(wallDepthBias + obj.y);
    };

    const addWallSegment = (
      x: number,
      y: number,
      w: number,
      h: number,
      color: number,
      alpha = 1,
    ): Phaser.GameObjects.Rectangle | Phaser.GameObjects.TileSprite => {
      if (hasWallTexture) {
        const tile = this.add.tileSprite(x, y, w, h, 'fortress_wall_tile')
          .setTint(color)
          .setAlpha(alpha);
        setWallDepth(tile);
        return tile;
      }
      const rect = this.add.rectangle(x, y, w, h, color, alpha);
      setWallDepth(rect);
      return rect;
    };

    const addWallAccent = (x: number, y: number, w: number, h: number, color: number, alpha: number): void => {
      const accent = this.add.rectangle(x, y, w, h, color, alpha);
      setWallDepth(accent);
    };
    const addWallDamage = (x: number, y: number, w: number, h: number, alpha: number): void => {
      if (!hasWallDamage) return;
      const crack = this.add.tileSprite(x, y, w, h, 'fortress_crack_tile')
        .setTint(0x5c3d29)
        .setAlpha(alpha);
      setWallDepth(crack);
    };

    addWallSegment((FORTRESS_LEFT - 26) + wall.topWallLeftWidth * 0.5, wall.topY, wall.topWallLeftWidth, 34, hasWallTexture ? 0xb98b5d : wallColor);
    addWallSegment(wall.gateRightEdge + wall.topWallRightWidth * 0.5, wall.topY, wall.topWallRightWidth, 34, hasWallTexture ? 0xb98b5d : wallColor);
    addWallSegment((FORTRESS_LEFT + FORTRESS_RIGHT) * 0.5, wall.bottomY, wall.fullWallWidth, 34, hasWallTexture ? 0xa97d55 : wallColor);
    addWallDamage((FORTRESS_LEFT - 26) + wall.topWallLeftWidth * 0.5, wall.topY, wall.topWallLeftWidth, 34, 0.07);
    addWallDamage(wall.gateRightEdge + wall.topWallRightWidth * 0.5, wall.topY, wall.topWallRightWidth, 34, 0.07);
    addWallDamage((FORTRESS_LEFT + FORTRESS_RIGHT) * 0.5, wall.bottomY, wall.fullWallWidth, 34, 0.08);

    for (let y = FORTRESS_TOP - 8; y <= FORTRESS_BOTTOM + 8; y += 52) {
      addWallSegment(wall.leftX, y, 34, 52, hasWallTexture ? 0xaf8358 : wallColor);
      addWallSegment(wall.rightX, y, 34, 52, hasWallTexture ? 0xaf8358 : wallColor);
      addWallDamage(wall.leftX, y, 34, 52, 0.07);
      addWallDamage(wall.rightX, y, 34, 52, 0.07);
    }

    addWallSegment(GATE_X, FORTRESS_TOP - 85, 192, 170, hasWallTexture ? 0xa1744c : 0x7f6144);
    addWallSegment(GATE_X, FORTRESS_TOP - 16, 232, 52, hasWallTexture ? 0xc69560 : 0x9b7650);
    addWallSegment(GATE_X - 66, FORTRESS_TOP - 90, 24, 96, hasWallTexture ? 0x6e4d32 : 0x493123);
    addWallSegment(GATE_X + 66, FORTRESS_TOP - 90, 24, 96, hasWallTexture ? 0x6e4d32 : 0x493123);
    addWallDamage(GATE_X, FORTRESS_TOP - 85, 192, 170, 0.09);
    addWallDamage(GATE_X, FORTRESS_TOP - 16, 232, 52, 0.07);

    if (hasWallTexture) {
      addWallAccent(GATE_X, FORTRESS_TOP - 102, 146, 8, 0xe3bb86, 0.32);
      addWallAccent(GATE_X, FORTRESS_TOP - 20, 198, 6, 0xe2bb84, 0.24);
      addWallAccent(GATE_X, FORTRESS_TOP + 34, 116, 4, 0x3d291a, 0.32);
      addWallAccent((FORTRESS_LEFT + FORTRESS_RIGHT) * 0.5, wall.bottomY + 10, wall.fullWallWidth - 28, 3, 0x3a281b, 0.28);
    }

    for (let x = FORTRESS_LEFT + 14; x < FORTRESS_RIGHT; x += 58) {
      if (Math.abs(x - GATE_X) < GATE_WIDTH * 0.65) continue;
      addWallSegment(x, FORTRESS_TOP - 24, 22, 18, hasWallTexture ? 0xc89662 : crenelColor);
      addWallSegment(x, FORTRESS_BOTTOM + 24, 22, 18, hasWallTexture ? 0xb88659 : crenelColor);
    }

    for (let y = FORTRESS_TOP + 40; y < FORTRESS_BOTTOM; y += 62) {
      addWallSegment(FORTRESS_LEFT - 24, y, 18, 22, hasWallTexture ? 0xbf8d5f : crenelColor);
      addWallSegment(FORTRESS_RIGHT + 24, y, 18, 22, hasWallTexture ? 0xbf8d5f : crenelColor);
    }
  }

  private decorateSceneProps(): void {
    const sentryLine = [
      { x: 604, y: 256, flip: false },
      { x: 1128, y: 170, flip: true },
      { x: 1738, y: 548, flip: true },
    ];
    sentryLine.forEach((spot) => {
      if (this.textures.exists('phaser_palm')) {
        this.add.image(spot.x, spot.y, 'phaser_palm')
          .setDepth(5)
          .setScale(0.72)
          .setFlipX(spot.flip)
          .setTint(0x7d6a48);
      }
    });

    const debris = [
      { x: 820, y: 472 },
      { x: 866, y: 456 },
      { x: 1526, y: 302 },
      { x: 1572, y: 316 },
      { x: 1606, y: 296 },
      { x: 2450, y: 1090 },
      { x: 2488, y: 1122 },
      { x: 3130, y: 952 },
      { x: 3182, y: 1016 },
      { x: 3510, y: 1602 },
      { x: 3564, y: 1646 },
    ];
    debris.forEach((spot, idx) => {
      this.add.ellipse(spot.x, spot.y + 10, 16, 6, 0x000000, 0.18).setDepth(2);
      this.add.image(spot.x, spot.y, 'rock_model')
        .setDepth(5)
        .setScale(0.56 + (idx % 3) * 0.08)
        .setTint(0x847058);
    });

    const innerCamp = [
      { x: 470, y: 2090 },
      { x: 660, y: 2210 },
      { x: 980, y: 2070 },
      { x: 1220, y: 2210 },
    ];
    innerCamp.forEach((spot, idx) => {
      this.add.ellipse(spot.x, spot.y + 14, 28, 10, 0x000000, 0.18).setDepth(2);
      this.add.image(spot.x, spot.y, idx % 2 === 0 ? 'tower_model' : 'ramp_model')
        .setDepth(5)
        .setScale(idx % 2 === 0 ? 0.62 : 0.78)
        .setTint(idx % 2 === 0 ? 0x87684a : 0x7c5e45);
      this.add.image(spot.x + 40, spot.y - 10, idx % 2 === 0 ? 'medical_crate_model' : 'tool_box_model')
        .setDepth(6)
        .setScale(idx % 2 === 0 ? 0.58 : 0.64)
        .setTint(idx % 2 === 0 ? 0x8f775f : 0x7a6a5a);
    });

    const campfireX = CAMPFIRE_POSITION.x;
    const campfireY = CAMPFIRE_POSITION.y;
    const campfireShadow = this.add.ellipse(campfireX, campfireY + 16, 44, 14, 0x000000, 0.24).setDepth(2);
    this.add.circle(campfireX, campfireY - 10, 30, 0xff9e4e, 0.14).setDepth(6);
    const campfireSprite = this.add.sprite(campfireX, campfireY, 'campfire_model')
      .setDepth(7)
      .setDisplaySize(72, 72);
    this.tweens.add({
      targets: campfireSprite,
      alpha: { from: 0.86, to: 1 },
      yoyo: true,
      repeat: -1,
      duration: 360,
      ease: 'sine.inOut',
    });
    this.campfireStation = {
      sprite: campfireSprite,
      shadow: campfireShadow,
      title: '后营篝火',
      prompt: `消耗 ${CAMPFIRE_CRAFT_COST} 片赤甲肉合成熟食`,
    };

    const submitX = SUPPLY_SUBMIT_POSITION.x;
    const submitY = SUPPLY_SUBMIT_POSITION.y;
    const submitShadow = this.add.ellipse(submitX, submitY + 14, 34, 12, 0x000000, 0.2).setDepth(2);
    this.add.circle(submitX, submitY - 16, 30, 0x9fd6ff, 0.08).setDepth(5);
    const submitTexture = this.textures.exists('official_supply_box') ? 'official_supply_box' : 'medical_crate_model';
    const submitSprite = this.add.sprite(submitX, submitY, submitTexture)
      .setDepth(7)
      .setDisplaySize(56, 56)
      .setTint(0xbfdcf4);
    this.add.text(submitX, submitY - 64, '物资提交处', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '20px',
      color: '#d8e9f7',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(WORLD_LABEL_DEPTH);
    this.supplySubmitStation = {
      sprite: submitSprite,
      shadow: submitShadow,
      title: '主城提交处',
      prompt: '提交关键补给，完成本次行动',
    };

    const duneShrubs = [
      { x: 1750, y: 820 }, { x: 1880, y: 980 }, { x: 2140, y: 910 }, { x: 2340, y: 1240 },
      { x: 2590, y: 1480 }, { x: 2920, y: 1320 }, { x: 3180, y: 1460 }, { x: 3360, y: 1820 },
      { x: 3610, y: 1710 }, { x: 3880, y: 1980 },
    ];
    duneShrubs.forEach((spot, idx) => {
      this.add.ellipse(spot.x, spot.y + 9, 18, 6, 0x000000, 0.16).setDepth(2);
      this.add.image(spot.x, spot.y, idx % 3 === 0 ? 'bush_model' : 'rock_model')
        .setDepth(4)
        .setScale(idx % 3 === 0 ? 0.88 : 0.52)
        .setTint(idx % 3 === 0 ? 0x8e704c : 0x7d6852);
    });

    this.createWildernessBushPatches();

    const watchLine = [
      { x: 1980, y: 760 }, { x: 2540, y: 680 }, { x: 3120, y: 840 }, { x: 3720, y: 1180 },
    ];
    watchLine.forEach((spot, idx) => {
      this.add.image(spot.x, spot.y, 'tower_model')
        .setDepth(6)
        .setScale(0.9 + idx * 0.06)
        .setTint(0x7c5d40);
      this.add.ellipse(spot.x, spot.y + 24, 34, 11, 0x000000, 0.22).setDepth(2);
    });
  }

  private createWildernessBushPatches(): void {
    this.bushPatches = [];
    if (!this.textures.exists('wilderness_bush_clump')) return;

    const presets: Array<BushPatch & { clumps: number }> = [
      { x: 1780, y: 760, radius: 90, clumps: 4 },
      { x: 2010, y: 930, radius: 120, clumps: 6 },
      { x: 2280, y: 1140, radius: 112, clumps: 5 },
      { x: 2540, y: 990, radius: 98, clumps: 4 },
      { x: 2830, y: 1220, radius: 128, clumps: 7 },
      { x: 3090, y: 980, radius: 108, clumps: 5 },
      { x: 3380, y: 1320, radius: 132, clumps: 8 },
      { x: 3560, y: 1730, radius: 118, clumps: 6 },
      { x: 3770, y: 1960, radius: 106, clumps: 5 },
    ];

    presets.forEach((preset) => {
      if (this.isInsideInnerWall(preset.x, preset.y)) return;
      this.bushPatches.push({ x: preset.x, y: preset.y, radius: preset.radius });
      this.add.ellipse(preset.x, preset.y + 18, preset.radius * 1.05, preset.radius * 0.48, 0x000000, 0.1).setDepth(2);

      for (let i = 0; i < preset.clumps; i += 1) {
        const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const offsetRadius = Phaser.Math.FloatBetween(0, preset.radius * 0.52);
        const clumpX = preset.x + Math.cos(angle) * offsetRadius + Phaser.Math.Between(-8, 8);
        const clumpY = preset.y + Math.sin(angle) * offsetRadius * 0.66 + Phaser.Math.Between(-6, 6);
        this.add.image(clumpX, clumpY, 'wilderness_bush_clump')
          .setDepth(4)
          .setScale(Phaser.Math.FloatBetween(0.2, 0.24))
          .setAlpha(0.9)
          .setTint(0xbe9a72);
      }
    });
  }

  private isPointInsideBush(x: number, y: number): boolean {
    return this.bushPatches.some((patch) => Phaser.Math.Distance.Between(x, y, patch.x, patch.y) <= patch.radius);
  }

  private isPointRevealedByScout(x: number, y: number): boolean {
    return this.scoutEyes.some((eye) => Phaser.Math.Distance.Between(eye.x, eye.y, x, y) <= Q_SCAN_RADIUS);
  }

  private createObstacleColliders(): void {
    const wall = this.getFortressWallLayout();
    const wallPad = 4;
    const edgeHalf = MAP_EDGE_WALL_THICKNESS * 0.5;
    const blocks: ObstacleBlock[] = [
      // Keep fortress colliders slightly larger than visuals to prevent visible overlap.
      { x: (FORTRESS_LEFT - 26) + wall.topWallLeftWidth * 0.5, y: wall.topY, w: wall.topWallLeftWidth + wallPad * 2, h: 34 + wallPad * 2 },
      { x: wall.gateRightEdge + wall.topWallRightWidth * 0.5, y: wall.topY, w: wall.topWallRightWidth + wallPad * 2, h: 34 + wallPad * 2 },
      { x: (FORTRESS_LEFT + FORTRESS_RIGHT) * 0.5, y: wall.bottomY, w: wall.fullWallWidth + wallPad * 2, h: 34 + wallPad * 2 },
      { x: WORLD_WIDTH * 0.5, y: edgeHalf, w: WORLD_WIDTH, h: MAP_EDGE_WALL_THICKNESS },
      { x: WORLD_WIDTH * 0.5, y: WORLD_HEIGHT - edgeHalf, w: WORLD_WIDTH, h: MAP_EDGE_WALL_THICKNESS },
      { x: edgeHalf, y: WORLD_HEIGHT * 0.5, w: MAP_EDGE_WALL_THICKNESS, h: WORLD_HEIGHT },
      { x: WORLD_WIDTH - edgeHalf, y: WORLD_HEIGHT * 0.5, w: MAP_EDGE_WALL_THICKNESS, h: WORLD_HEIGHT },
      { x: 2440, y: 1140, w: 320, h: 84 },
      { x: 3140, y: 980, w: 360, h: 96 },
      { x: 3520, y: 1560, w: 280, h: 88 },
      { x: 2860, y: 1820, w: 420, h: 96 },
    ];
    for (let y = FORTRESS_TOP - 8; y <= FORTRESS_BOTTOM + 8; y += 52) {
      blocks.push({ x: wall.leftX, y, w: 34 + wallPad * 2, h: 52 + wallPad * 2 });
      blocks.push({ x: wall.rightX, y, w: 34 + wallPad * 2, h: 52 + wallPad * 2 });
    }

    this.obstacleZones.forEach((zone) => zone.destroy());
    this.obstacleZones = [];

    const addObstacleZone = (b: ObstacleBlock): void => {
      const zone = this.add.zone(b.x, b.y, b.w, b.h);
      this.physics.add.existing(zone, true);
      const body = zone.body as Phaser.Physics.Arcade.StaticBody;
      body.setSize(b.w, b.h);
      body.updateFromGameObject();
      this.obstacleZones.push(zone);
      this.physics.add.collider(this.player, zone);
      this.physics.add.collider(this.enemyGroup, zone);
    };

    blocks.forEach((b) => addObstacleZone(b));
  }

  private setupCameraAndAtmosphere(): void {
    this.cameras.main.setZoom(1.04);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08, 0, 20);

    this.atmosphereFog = this.add.rectangle(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, VIEW_WIDTH, VIEW_HEIGHT, 0xc27c3d, 0.08)
      .setScrollFactor(0)
      .setDepth(520);

    this.atmosphereVignette = this.add.graphics().setScrollFactor(0).setDepth(530);
    this.atmosphereVignette.fillStyle(0x000000, 0.22);
    this.atmosphereVignette.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    this.atmosphereVignette.fillStyle(0x000000, 0);
    this.atmosphereVignette.fillCircle(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, 310);

    const sunGlow = this.add.ellipse(220, 120, 360, 200, 0xffc16a, 0.16)
      .setScrollFactor(0)
      .setDepth(521);
    this.tweens.add({
      targets: [sunGlow, this.atmosphereFog],
      alpha: { from: 0.08, to: 0.14 },
      duration: 3600,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    });
  }

  private spawnPlayer(): void {
    this.playerShadow = this.add.ellipse(
      PLAYER_SPAWN_POSITION.x,
      PLAYER_SPAWN_POSITION.y + PLAYER_SHADOW_Y_OFFSET,
      16 * CHARACTER_SIZE_MULTIPLIER,
      8 * CHARACTER_SIZE_MULTIPLIER,
      0x000000,
      0.35,
    ).setDepth(2);
    const useStateSprite = this.textures.exists('shouyue_state_idle');
    const playerKey = useStateSprite ? 'shouyue_state_idle' : (this.textures.exists('official_shouyue') ? 'official_shouyue' : 'player_model');
    this.player = this.physics.add.sprite(PLAYER_SPAWN_POSITION.x, PLAYER_SPAWN_POSITION.y, playerKey).setDepth(6);
    if (useStateSprite) {
      this.player.setDisplaySize(
        Math.round(54 * CHARACTER_SIZE_MULTIPLIER),
        Math.round(82 * CHARACTER_SIZE_MULTIPLIER),
      );
    } else {
      this.player.setDisplaySize(
        Math.round(36 * CHARACTER_SIZE_MULTIPLIER),
        Math.round(36 * CHARACTER_SIZE_MULTIPLIER),
      );
    }
    this.applyPlayerBodyHitbox();
    this.player.setCollideWorldBounds(true);
    this.enemyGroup = this.physics.add.group();
    this.bullets = this.physics.add.group({
      classType: Phaser.Physics.Arcade.Image,
      maxSize: 80,
      runChildUpdate: false,
    });
  }

  private applyPlayerBodyHitbox(): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const bodyW = Math.max(24, Math.round(this.player.displayWidth * 0.82));
    const bodyH = Math.max(42, Math.round(this.player.displayHeight * 0.9));
    const offsetX = Math.round((this.player.displayWidth - bodyW) * 0.5);
    const offsetY = Math.round(this.player.displayHeight - bodyH - 2);
    body.setSize(bodyW, bodyH);
    body.setOffset(offsetX, offsetY);
  }

  private spawnEnemies(): void {
    const points = [
      { x: 2060, y: 900, kind: 'grunt' as EnemyKind },
      { x: 2280, y: 1080, kind: 'grunt' as EnemyKind },
      { x: 2360, y: 1380, kind: 'grunt' as EnemyKind },
      { x: 2480, y: 1280, kind: 'grunt' as EnemyKind },
      { x: 2820, y: 960, kind: 'grunt' as EnemyKind },
      { x: 2920, y: 1120, kind: 'grunt' as EnemyKind },
      { x: 3060, y: 1240, kind: 'grunt' as EnemyKind },
      { x: 3260, y: 1360, kind: 'grunt' as EnemyKind },
      { x: 3340, y: 1640, kind: 'grunt' as EnemyKind },
      { x: 3620, y: 1480, kind: 'grunt' as EnemyKind },
      { x: 3440, y: 1880, kind: 'grunt' as EnemyKind },
    ];
    points.forEach((p) => this.spawnEnemy(p.x, p.y, p.kind));
  }

  private spawnEnemy(x: number, y: number, kind: EnemyKind = 'grunt', stoneGolemType?: StoneGolemType): EnemyUnit | undefined {
    if (this.isInsideInnerWall(x, y)) return undefined;
    const shadow = this.add.ellipse(
      x,
      y + ENEMY_SHADOW_Y_OFFSET,
      18 * CHARACTER_SIZE_MULTIPLIER,
      8 * CHARACTER_SIZE_MULTIPLIER,
      0x000000,
      0.28,
    ).setDepth(2);
    const gruntVariantKeys = ['enemy_grunt_blue', 'enemy_grunt_red'].filter((key) => this.textures.exists(key));
    const gruntKey = gruntVariantKeys.length > 0
      ? gruntVariantKeys[Phaser.Math.Between(0, gruntVariantKeys.length - 1)]
      : 'enemy_grunt_model';
    const eliteKey = stoneGolemType === 'crimson_statue' && this.textures.exists('elite_statue_crimson')
      ? 'elite_statue_crimson'
      : stoneGolemType === 'azure_statue' && this.textures.exists('elite_statue_azure')
        ? 'elite_statue_azure'
        : 'enemy_elite_model';
    const enemyKey = kind === 'boss' ? 'enemy_boss_model' : kind === 'elite' ? eliteKey : gruntKey;
    const sprite = this.physics.add.sprite(x, y, enemyKey).setDepth(6);
    const isElite = kind === 'elite';
    const isBoss = kind === 'boss';
    const isStoneGolem = isElite && Boolean(stoneGolemType);
    const baseScale = (isBoss ? 84 : isElite ? 60 : 42) * CHARACTER_SIZE_MULTIPLIER;
    const displayScale = !isElite && !isBoss
      ? baseScale * GRUNT_VISUAL_SCALE_MULTIPLIER
      : baseScale;
    const hp = isStoneGolem ? STONE_GOLEM_SHOTS_TO_KILL : (isBoss ? 1800 : isElite ? 620 : 300);
    const speed = isBoss ? 186 : isElite ? 132 : 92;
    const attackDamage = isBoss ? 58 : isElite ? 28 : 15;
    const chaseRadius = isBoss ? 720 : isElite ? 500 : 340;
    sprite.setDisplaySize(displayScale, displayScale);
    if (isStoneGolem && stoneGolemType) {
      const targetHeight = STONE_GOLEM_DISPLAY_HEIGHT;
      const frameWidth = sprite.frame.realWidth > 0 ? sprite.frame.realWidth : sprite.frame.width;
      const frameHeight = sprite.frame.realHeight > 0 ? sprite.frame.realHeight : sprite.frame.height;
      const targetWidth = Math.max(1, Math.round(targetHeight * (frameHeight > 0 ? (frameWidth / frameHeight) : 1)));
      sprite.setDisplaySize(targetWidth, targetHeight);
      sprite.setAlpha(0.96);
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      body.setSize(
        Math.max(56, Math.round(targetWidth * 0.58)),
        Math.max(56, Math.round(targetHeight * 0.62)),
        true,
      );
    }
    if (!isElite && !isBoss) {
      // Keep grunt collision large and give the yellow variant a +80% hitbox.
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      const isYellowGrunt = gruntKey === 'enemy_grunt_red';
      const gruntColliderSize = Math.round(GRUNT_COLLIDER_SIZE * (isYellowGrunt ? YELLOW_GRUNT_COLLIDER_MULTIPLIER : 1));
      body.setSize(gruntColliderSize, gruntColliderSize, true);
    }
    sprite.setCollideWorldBounds(true);
    this.enemyGroup.add(sprite);
    const enemy: EnemyUnit = {
      sprite,
      shadow,
      kind,
      stoneGolemType,
      shotsToKillRemaining: isStoneGolem ? STONE_GOLEM_SHOTS_TO_KILL : undefined,
      hp,
      maxHp: hp,
      speed,
      attackDamage,
      chaseRadius,
      wanderDir: new Phaser.Math.Vector2(Phaser.Math.Between(-1, 1) || 1, Phaser.Math.Between(-1, 1) || -1).normalize(),
      lastDamageAt: 0,
      lastAttackAt: 0,
      anchor: new Phaser.Math.Vector2(x, y),
      nextRetargetAt: this.time.now + Phaser.Math.Between(1200, 2600),
      stealthUntil: isBoss ? this.time.now + 1800 : undefined,
      burstReadyAt: isBoss ? this.time.now + 3400 : undefined,
    };
    this.enemies.push(enemy);
    return enemy;
  }


  private spawnLootContainers(): void {
    this.lootContainers = SUPPLY_CACHE_LAYOUT
      .filter((spot) => !this.isInsideInnerWall(spot.x, spot.y))
      .map((spot) => {
      const shadow = this.add.ellipse(spot.x, spot.y + 13, 28, 10, 0x000000, 0.25).setDepth(2);
      const textureKey =
        spot.theme === 'grain'
          ? 'wagon_wreck_model'
          : spot.theme === 'medical'
            ? 'medical_crate_model'
            : spot.theme === 'ordnance'
              ? 'ammo_crate_model'
              : spot.theme === 'survival'
                ? 'tent_ruin_model'
                : 'tool_box_model';
      const sprite = this.add.sprite(spot.x, spot.y, textureKey).setDepth(5);
      sprite.setDisplaySize(
        spot.theme === 'grain' ? 62 : spot.theme === 'survival' ? 56 : 44,
        spot.theme === 'grain' ? 42 : spot.theme === 'survival' ? 34 : 30,
      );
      this.add.circle(spot.x, spot.y - 8, 24, 0xf6d89a, 0.06).setDepth(4);
      return {
        sprite,
        shadow,
        title: spot.title,
        opened: false,
        theme: spot.theme,
        prompt: spot.prompt,
        hint: getSupplyPrompt(spot.items.map((item) => item.id)),
        items: buildSupplyItems(spot.items),
      };
      });
  }


  private spawnNpcs(): void {
    const points: Array<{ x: number; y: number; key: string; name: keyof typeof NPC_PROFILE_COPY }> = [
      {
        x: 420,
        y: 1980,
        key: this.textures.exists('official_npc_mulan') ? 'official_npc_mulan' : 'npc_mulan',
        name: '花木兰',
      },
      {
        x: 520,
        y: 2050,
        key: this.textures.exists('official_npc_kai') ? 'official_npc_kai' : 'npc_kai',
        name: '铠',
      },
      {
        x: 640,
        y: 2110,
        key: this.textures.exists('official_npc_xuance') ? 'official_npc_xuance' : 'npc_xuance',
        name: '百里玄策',
      },
    ];

    this.npcs = points.map((it) => {
      const profile = NPC_PROFILE_COPY[it.name];
      const route = (NPC_PATROL_ROUTES[it.name] ?? [{ x: it.x, y: it.y }]).map((point) => new Phaser.Math.Vector2(point.x, point.y));
      const speed = it.name === '花木兰' ? 34 : it.name === '铠' ? 52 : 76;
      const shadow = this.add.ellipse(
        it.x,
        it.y + NPC_SHADOW_Y_OFFSET,
        18 * CHARACTER_SIZE_MULTIPLIER,
        8 * CHARACTER_SIZE_MULTIPLIER,
        0x000000,
        0.27,
      ).setDepth(2);
      const isOfficialNpc = it.key.startsWith('official_');
      const isShouyueSizedNpc = it.name === '铠' || it.name === '花木兰' || it.name === '百里玄策';
      const displayWidth = (isOfficialNpc ? (isShouyueSizedNpc ? 54 : 52) : 42) * CHARACTER_SIZE_MULTIPLIER;
      const displayHeight = (isOfficialNpc ? (isShouyueSizedNpc ? 82 : 52) : 42) * CHARACTER_SIZE_MULTIPLIER;
      const sprite = this.add.sprite(it.x, it.y, it.key).setDisplaySize(displayWidth, displayHeight).setDepth(7);
      const label = this.add.text(it.x, it.y - NPC_LABEL_Y_OFFSET, it.name, {
        fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
        fontSize: '14px',
        color: '#f2e7cd',
      }).setDepth(20).setOrigin(0.5);
      return {
        sprite,
        shadow,
        label,
        name: it.name,
        role: profile.role,
        line: profile.line,
        persona: profile.persona,
        state: it.name === '花木兰' ? 'guard' : 'patrol',
        speed,
        patrolRoute: route,
        patrolIndex: 0,
        target: route[0]?.clone() ?? new Phaser.Math.Vector2(it.x, it.y),
        facingLeft: false,
        stateUntil: this.time.now + Phaser.Math.Between(700, 1500),
        talkCooldownUntil: 0,
      };
    });
  }

  private createUi(): void {
    const topPanel = this.add.rectangle(250, 152, 468, 250, 0x0f181d, 0.86)
      .setStrokeStyle(2, 0x3a5660, 0.92)
      .setDepth(UI_DEPTH_BASE + 28)
      .setScrollFactor(0);
    this.hudDecor = [topPanel];

    this.hudTop = this.add.text(24, 30, '', {
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: '16px',
      color: '#d7dfd2',
      lineSpacing: 6,
      wordWrap: { width: 440 },
    }).setDepth(UI_DEPTH_BASE + 30).setScrollFactor(0);

    this.hudRisk = this.add.text(24, 112, '', {
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: '16px',
      color: '#f0c67a',
      wordWrap: { width: 440 },
    }).setDepth(UI_DEPTH_BASE + 30).setScrollFactor(0);

    this.hudHint = this.add.text(24, 146, '', {
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: '14px',
      color: '#9eb3a8',
      lineSpacing: 4,
      wordWrap: { width: 440 },
    }).setDepth(UI_DEPTH_BASE + 30).setScrollFactor(0);

    this.skillBoard = this.add.text(24, 220, '', {
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: '15px',
      color: '#8fd3bf',
      lineSpacing: 5,
      wordWrap: { width: 440 },
    }).setDepth(UI_DEPTH_BASE + 30).setScrollFactor(0);
    this.hudDetailItems = [this.hudTop, this.hudRisk, this.skillBoard];

    this.banner = this.add.text(640, 44, '', {
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: '22px',
      color: '#f4e4b6',
      backgroundColor: '#111c1f',
      padding: { left: 10, right: 10, top: 6, bottom: 6 },
    }).setOrigin(0.5).setDepth(UI_DEPTH_BASE + 50).setVisible(false).setScrollFactor(0);

    this.npcDialog = this.add.text(640, 566, '', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '20px',
      color: '#f6ead8',
      backgroundColor: '#121f22',
      padding: { left: 14, right: 14, top: 10, bottom: 10 },
      lineSpacing: 6,
      align: 'center',
    }).setOrigin(0.5).setDepth(UI_DEPTH_BASE + 52).setVisible(false).setScrollFactor(0);

    this.createHudToggle();
    this.createHotbar();
    this.createLootPanel();
    this.createCrosshair();
    this.createDialogueOverlay();
    this.createFailureDialog();
    this.createSettlementDialog();
    this.createCampfireConfirmDialog();
    this.createRecoveryProgressUi();
    this.createReloadProgressUi();
    this.interactionRing = this.add.ellipse(0, 0, 68, 24, 0xffe2a2, 0.08)
      .setStrokeStyle(2, 0xffd48c, 0.75)
      .setDepth(24)
      .setVisible(false);
    this.interactionWorldHint = this.add.text(0, 0, '', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '16px',
      color: '#f6e7c3',
      backgroundColor: '#1a1714dd',
      padding: { left: 10, right: 10, top: 5, bottom: 5 },
      align: 'center',
    }).setOrigin(0.5, 1).setDepth(25).setVisible(false);
  }

  private createFailureDialog(): void {
    const mask = this.add.rectangle(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, VIEW_WIDTH, VIEW_HEIGHT, 0x000000, 0.5)
      .setDepth(UI_DEPTH_BASE + 120)
      .setScrollFactor(0)
      .setVisible(false)
      .setInteractive();
    const panel = this.add.rectangle(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, 560, 292, 0x0f171c, 0.96)
      .setStrokeStyle(2, 0x7f5a5f, 0.95)
      .setDepth(UI_DEPTH_BASE + 121)
      .setScrollFactor(0)
      .setVisible(false);
    const title = this.add.text(VIEW_WIDTH / 2, 272, '行动失败', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '42px',
      color: '#f4d9cb',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(UI_DEPTH_BASE + 122).setScrollFactor(0).setVisible(false);
    const message = this.add.text(VIEW_WIDTH / 2, 334, '守约倒在了城外。', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '22px',
      color: '#d8c7be',
      align: 'center',
    }).setOrigin(0.5).setDepth(UI_DEPTH_BASE + 122).setScrollFactor(0).setVisible(false);

    const retryBtn = this.add.rectangle(520, 418, 220, 62, 0x274e4f, 0.96)
      .setStrokeStyle(2, 0x77b5a6)
      .setDepth(UI_DEPTH_BASE + 122)
      .setScrollFactor(0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    const retryTxt = this.add.text(520, 418, '再试一次', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '28px',
      color: '#e8f4ee',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(UI_DEPTH_BASE + 123).setScrollFactor(0).setVisible(false);

    const homeBtn = this.add.rectangle(760, 418, 220, 62, 0x2b2326, 0.96)
      .setStrokeStyle(2, 0x8c6c70)
      .setDepth(UI_DEPTH_BASE + 122)
      .setScrollFactor(0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    const homeTxt = this.add.text(760, 418, '返回首页', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '28px',
      color: '#f1dde0',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(UI_DEPTH_BASE + 123).setScrollFactor(0).setVisible(false);

    this.failureDialog = {
      mask,
      panel,
      title,
      message,
      retryBtn,
      retryTxt,
      homeBtn,
      homeTxt,
    };
    this.setFailureDialogVisible(false);

    retryBtn.on('pointerdown', () => {
      this.registry.set('missionConfig', this.missionConfig);
      this.scene.restart(this.missionConfig);
    });
    homeBtn.on('pointerdown', () => {
      this.scene.start('MainMenuScene');
    });
  }

  private setFailureDialogVisible(visible: boolean): void {
    if (!this.failureDialog) return;
    const {
      mask,
      panel,
      title,
      message,
      retryBtn,
      retryTxt,
      homeBtn,
      homeTxt,
    } = this.failureDialog;
    [mask, panel, title, message, retryBtn, retryTxt, homeBtn, homeTxt].forEach((obj) => obj.setVisible(visible));

    const setInputEnabled = (obj: Phaser.GameObjects.GameObject): void => {
      const inputObj = (obj as unknown as { input?: Phaser.Types.Input.InputConfiguration & { enabled?: boolean } }).input;
      if (inputObj && typeof inputObj.enabled === 'boolean') inputObj.enabled = visible;
    };
    [mask, retryBtn, homeBtn].forEach(setInputEnabled);
  }

  private createSettlementDialog(): void {
    const bg = this.add.image(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, 'mission_result_bg2')
      .setDisplaySize(VIEW_WIDTH, VIEW_HEIGHT)
      .setDepth(UI_DEPTH_BASE + 140)
      .setScrollFactor(0)
      .setVisible(false);
    const dim = this.add.rectangle(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, VIEW_WIDTH, VIEW_HEIGHT, 0x000000, 0)
      .setDepth(UI_DEPTH_BASE + 141)
      .setScrollFactor(0)
      .setVisible(false)
      .setInteractive();
    const title = this.add.text(VIEW_WIDTH / 2, 152, '行动结算', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '54px',
      color: '#f3efe5',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(UI_DEPTH_BASE + 142).setScrollFactor(0).setVisible(false);
    const message = this.add.text(VIEW_WIDTH / 2, 244, '', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '30px',
      color: '#f4eee3',
      align: 'center',
      lineSpacing: 8,
      wordWrap: { width: 920 },
    }).setOrigin(0.5, 0.5).setDepth(UI_DEPTH_BASE + 142).setScrollFactor(0).setVisible(false);
    const detail = this.add.text(VIEW_WIDTH / 2, 316, '', {
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: '16px',
      color: '#2f3342',
      align: 'center',
      lineSpacing: 5,
      wordWrap: { width: 900 },
    }).setOrigin(0.5, 0).setDepth(UI_DEPTH_BASE + 142).setScrollFactor(0).setVisible(false);

    const retryBtn = this.add.rectangle(VIEW_WIDTH - 364, VIEW_HEIGHT - 44, 220, 56, 0x264f56, 0.96)
      .setStrokeStyle(2, 0x8dd0c2)
      .setDepth(UI_DEPTH_BASE + 143)
      .setScrollFactor(0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    const retryTxt = this.add.text(VIEW_WIDTH - 364, VIEW_HEIGHT - 44, '再试一次', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '27px',
      color: '#e7f3ee',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(UI_DEPTH_BASE + 144).setScrollFactor(0).setVisible(false);

    const homeBtn = this.add.rectangle(VIEW_WIDTH - 132, VIEW_HEIGHT - 44, 220, 56, 0x14232f, 0.96)
      .setStrokeStyle(2, 0x7cb0d0)
      .setDepth(UI_DEPTH_BASE + 143)
      .setScrollFactor(0)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    const homeTxt = this.add.text(VIEW_WIDTH - 132, VIEW_HEIGHT - 44, '回到首页', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '27px',
      color: '#e4eef8',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(UI_DEPTH_BASE + 144).setScrollFactor(0).setVisible(false);

    this.settlementDialog = {
      bg,
      dim,
      title,
      message,
      detail,
      retryBtn,
      retryTxt,
      homeBtn,
      homeTxt,
    };
    this.setSettlementDialogVisible(false, false);

    retryBtn.on('pointerdown', () => {
      this.registry.set('missionConfig', this.missionConfig);
      this.scene.restart(this.missionConfig);
    });
    homeBtn.on('pointerdown', () => {
      this.scene.start('MainMenuScene');
    });
  }

  private setSettlementDialogVisible(visible: boolean, allowRetry: boolean): void {
    if (!this.settlementDialog) return;
    const {
      bg,
      dim,
      title,
      message,
      detail,
      retryBtn,
      retryTxt,
      homeBtn,
      homeTxt,
    } = this.settlementDialog;
    [bg, dim, title, message, detail, homeBtn, homeTxt].forEach((obj) => obj.setVisible(visible));
    const retryVisible = visible && allowRetry;
    [retryBtn, retryTxt].forEach((obj) => obj.setVisible(retryVisible));

    const setInputEnabled = (obj: Phaser.GameObjects.GameObject, enabled: boolean): void => {
      const inputObj = (obj as unknown as { input?: Phaser.Types.Input.InputConfiguration & { enabled?: boolean } }).input;
      if (inputObj && typeof inputObj.enabled === 'boolean') inputObj.enabled = enabled;
    };
    setInputEnabled(dim, visible);
    setInputEnabled(homeBtn, visible);
    setInputEnabled(retryBtn, retryVisible);
  }

  private showSettlementDialog(titleText: string, messageText: string, allowRetry: boolean): void {
    if (this.resultShown) return;
    this.resultShown = true;
    this.bannerHideEvent?.remove(false);
    this.banner.setVisible(false);
    this.dialogueOverlay?.hide();
    if (this.lootPanelOpen) {
      this.lootPanelOpen = false;
      this.refreshLootPanel();
    }
    this.interactionRing.setVisible(false);
    this.interactionWorldHint.setVisible(false);
    this.setCampfireConfirmVisible(false);
    this.setFailureDialogVisible(false);
    this.recoveryUseUntil = 0;
    this.recoveryUseItemLabel = '';
    this.recoveryUseHealAmount = 0;
    this.recoveryProgressBar.clear();
    this.recoveryProgressBar.setVisible(false);
    this.recoveryProgressLabel.setVisible(false);
    this.reloadFinishAt = 0;
    this.reloadStartAt = 0;
    this.reloadDurationMs = 0;
    this.reloadProgressBar.clear();
    this.reloadProgressBar.setVisible(false);
    this.reloadProgressLabel.setVisible(false);

    if (!this.settlementDialog) return;
    const survivedSeconds = Math.max(0, Math.floor((this.time.now - this.missionStartAt) / 1000));
    const settledCollected = this.suppliesDelivered ? this.objectiveNeed : this.objectiveCollected;
    this.settlementDialog.title.setText(titleText);
    this.settlementDialog.message.setText(messageText);
    this.settlementDialog.detail.setText(
      `关键补给 ${settledCollected}/${this.objectiveNeed}  |  敌军残余 ${this.enemies.length}  |  生存时间 ${survivedSeconds}s`,
    );
    this.setSettlementDialogVisible(true, allowRetry);
  }

  private createCampfireConfirmDialog(): void {
    const panel = this.add.rectangle(VIEW_WIDTH / 2, VIEW_HEIGHT - 160, 560, 132, 0x10191d, 0.95)
      .setStrokeStyle(2, 0x6f8a83, 0.95)
      .setDepth(UI_DEPTH_BASE + 102)
      .setScrollFactor(0)
      .setVisible(false);
    const title = this.add.text(VIEW_WIDTH / 2, VIEW_HEIGHT - 200, '篝火烹饪', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '28px',
      color: '#e6efe8',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(UI_DEPTH_BASE + 103).setScrollFactor(0).setVisible(false);
    const message = this.add.text(VIEW_WIDTH / 2, VIEW_HEIGHT - 160, `是否消耗 ${CAMPFIRE_CRAFT_COST} 片赤甲肉合成熟食？`, {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '21px',
      color: '#d4e1d9',
      align: 'center',
    }).setOrigin(0.5).setDepth(UI_DEPTH_BASE + 103).setScrollFactor(0).setVisible(false);
    const hint = this.add.text(VIEW_WIDTH / 2, VIEW_HEIGHT - 126, '再次按 F 确认合成', {
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: '15px',
      color: '#9fc2b6',
      align: 'center',
    }).setOrigin(0.5).setDepth(UI_DEPTH_BASE + 103).setScrollFactor(0).setVisible(false);

    this.campfireConfirmDialog = {
      panel,
      title,
      message,
      hint,
    };
    this.setCampfireConfirmVisible(false);
  }

  private setCampfireConfirmVisible(visible: boolean): void {
    this.campfireAwaitConfirm = visible;
    if (!this.campfireConfirmDialog) return;
    const { panel, title, message, hint } = this.campfireConfirmDialog;
    [panel, title, message, hint].forEach((obj) => obj.setVisible(visible));
  }

  private createRecoveryProgressUi(): void {
    this.recoveryProgressBar = this.add.graphics().setDepth(240).setVisible(false);
    this.recoveryProgressLabel = this.add.text(0, 0, '恢复中...', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '13px',
      color: '#d7efe2',
    }).setOrigin(0.5, 1).setDepth(241).setVisible(false);
  }

  private createReloadProgressUi(): void {
    this.reloadProgressBar = this.add.graphics().setDepth(242).setVisible(false);
    this.reloadProgressLabel = this.add.text(0, 0, '换弹中...', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '13px',
      color: '#f6ead0',
    }).setOrigin(0.5, 1).setDepth(243).setVisible(false);
  }

  private createDialogueOverlay(): void {
    if (!this.dialogueOverlay) {
      this.dialogueOverlay = new DialogueOverlay();
      this.dialogueOverlay.setOnSubmit((message) => {
        void this.handleDialogueSubmit(message);
      });
    }
  }

  private isDialogueOpen(): boolean {
    return this.dialogueOverlay?.isVisible() ?? false;
  }

  private createHudToggle(): void {
    const toggleWidth = 188;
    const toggleCenterX = 1168;
    const toggleY = 34;
    const bg = this.add.rectangle(toggleCenterX, toggleY, toggleWidth, 34, 0x0f171c, 0.86)
      .setStrokeStyle(2, 0x507c84, 0.92);
    const label = this.add.text(toggleCenterX, toggleY, '', {
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: '14px',
      color: '#d9e6df',
    }).setOrigin(0.5);

    this.hudToggleButton = this.add.container(0, 0, [bg, label])
      .setDepth(UI_DEPTH_BASE + 34)
      .setScrollFactor(0)
      .setSize(toggleWidth, 34)
      .setInteractive(
        new Phaser.Geom.Rectangle(toggleCenterX - toggleWidth * 0.5, toggleY - 17, toggleWidth, 34),
        Phaser.Geom.Rectangle.Contains,
      );
    this.hudToggleLabel = label;
    this.hudToggleButton.on('pointerdown', () => this.toggleHudVisibility());
    this.syncHudVisibility();
  }

  private createHotbar(): void {
    const baseX = 442;
    const y = 676;
    for (let i = 0; i < this.weaponSlots.length; i += 1) {
      const x = baseX + i * 140;
      const box = this.add.rectangle(x, y, 128, 64, 0x141f23, 0.92)
        .setStrokeStyle(2, 0x3c565f)
        .setDepth(UI_DEPTH_BASE + 40)
        .setScrollFactor(0);
      const label = this.add.text(x - 52, y - 20, '', {
        fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
        fontSize: '16px',
        color: '#dbe5df',
      }).setDepth(UI_DEPTH_BASE + 41).setScrollFactor(0);
      const ammo = this.add.text(x - 52, y + 4, '', {
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: '13px',
        color: '#aabeb4',
      }).setDepth(UI_DEPTH_BASE + 41).setScrollFactor(0);
      this.hotbarSlots.push({ box, label, ammo });
    }
  }

  private createLootPanel(): void {
    this.lootPanelBg = this.add.rectangle(640, 360, 1040, 520, 0x0f191c, 0.94)
      .setStrokeStyle(2, 0x3b5b56)
      .setDepth(UI_DEPTH_BASE + 60)
      .setScrollFactor(0)
      .setVisible(false);

    this.lootTitle = this.add.text(640, 120, '战利品', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '28px',
      color: '#e7f0ea',
    }).setOrigin(0.5).setDepth(UI_DEPTH_BASE + 61).setScrollFactor(0).setVisible(false);

    this.invHeader = this.add.text(220, 170, '背包', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '20px',
      color: '#c7dbd1',
    }).setDepth(UI_DEPTH_BASE + 61).setScrollFactor(0).setVisible(false);

    this.boxHeader = this.add.text(760, 170, '补给箱', {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: '20px',
      color: '#c7dbd1',
    }).setDepth(UI_DEPTH_BASE + 61).setScrollFactor(0).setVisible(false);
  }

  private createCrosshair(): void {
    this.crosshair = this.add.graphics().setDepth(UI_DEPTH_BASE + 45).setScrollFactor(0);
  }

  private setupInput(): void {
    const keyboard = this.input.keyboard;
    this.cursors = keyboard!.createCursorKeys();
    this.keys = keyboard!.addKeys('W,A,S,D,SHIFT,SPACE,Q,E,F,R,TAB,H,FIVE') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.on('pointerdown', () => this.ensureAudioReady());
    this.input.keyboard?.on('keydown', () => this.ensureAudioReady());
  }

  private setupCombatOverlap(): void {
    this.physics.add.overlap(this.bullets, this.enemyGroup, (bulletObj, enemyObj) => {
      const bullet = bulletObj as Phaser.Physics.Arcade.Image;
      if (bullet.getData('consumed')) return;
      bullet.setData('consumed', true);
      const enemySprite = enemyObj as Phaser.Physics.Arcade.Sprite;
      const hitDamage = Number(bullet.getData('damage') ?? this.currentWeapon().damage);
      const impactX = bullet.x;
      const impactY = bullet.y;
      bullet.setActive(false).setVisible(false).setVelocity(0);
      const bulletBody = bullet.body as Phaser.Physics.Arcade.Body | undefined;
      if (bulletBody) bulletBody.enable = false;
      const hit = this.enemies.find((e) => e.sprite === enemySprite);
      if (!hit) return;
      const now = this.time.now;
      if (hit.stoneGolemType && now - hit.lastDamageAt < STONE_GOLEM_HIT_DEBOUNCE_MS) return;
      hit.lastDamageAt = now;
      if (hit.stoneGolemType) {
        const remainingShots = Math.max(0, (hit.shotsToKillRemaining ?? STONE_GOLEM_SHOTS_TO_KILL) - 1);
        hit.shotsToKillRemaining = remainingShots;
        hit.hp = remainingShots;
      } else {
        hit.hp -= hitDamage;
      }

      const impactCore = this.add.circle(impactX, impactY, 10, 0xffd8a1, 0.85).setDepth(1250);
      this.tweens.add({
        targets: impactCore,
        radius: 26,
        alpha: 0,
        duration: 130,
        onComplete: () => impactCore.destroy(),
      });
      for (let i = 0; i < 6; i += 1) {
        const frag = this.add.circle(impactX, impactY, Phaser.Math.Between(2, 4), 0xffb067, 0.9).setDepth(1240);
        const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const spd = Phaser.Math.Between(34, 72);
        this.tweens.add({
          targets: frag,
          x: impactX + Math.cos(ang) * spd,
          y: impactY + Math.sin(ang) * spd,
          alpha: 0,
          duration: 170,
          onComplete: () => frag.destroy(),
        });
      }

      if (hit.hp <= 0) {
        if (hit.stoneGolemType) {
          this.handleStoneGolemDefeated(hit.stoneGolemType);
        }
        this.dropEnemyLoot(hit);
        hit.shadow.destroy();
        hit.sprite.destroy();
        this.enemies = this.enemies.filter((e) => e !== hit);
      }
    });
  }

  private ensureAudioReady(): void {
    if (!this.audioCtx) {
      const Ctx = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.audioCtx = new Ctx();
    }
    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }
  }

  private playLoadedSfx(keys: string[], volume = 0.45, rate = 1): boolean {
    const available = keys.filter((key) => this.cache.audio.exists(key));
    if (available.length === 0) return false;
    const poolKey = available.join('|');
    const nextIndex = this.sfxVariantIndex[poolKey] ?? 0;
    const choice = available[nextIndex % available.length];
    this.sfxVariantIndex[poolKey] = nextIndex + 1;
    this.sound.play(choice, { volume, rate });
    return true;
  }

  private triggerDashCounterShot(): void {
    const weapon = this.currentWeapon();
    const currentMag = this.weaponMags[weapon.id];
    if (currentMag <= 0) {
      this.hudHint.setText('弹匣为空，无法反击射击。');
      return;
    }
    this.weaponMags[weapon.id] = currentMag - 1;
    this.lastFireAt = this.time.now;
    this.fireProjectile(weapon, 'dash');
  }

  private resolveAimDirection(pointer = this.input.activePointer): Phaser.Math.Vector2 {
    // Use camera conversion every frame so aim direction stays correct even when the camera moves
    // and the mouse itself does not move (pointer.worldX/worldY can lag in that case).
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const aim = new Phaser.Math.Vector2(worldPoint.x - this.player.x, worldPoint.y - this.player.y);
    if (aim.lengthSq() <= 0.0001) {
      return this.aimDir.clone();
    }
    return aim.normalize();
  }

  private getMuzzleWorldPosition(aim = this.aimDir): Phaser.Math.Vector2 {
    const resolvedAim = aim.clone();
    if (resolvedAim.lengthSq() <= 0.0001) {
      resolvedAim.set(this.player.flipX ? -1 : 1, 0);
    } else {
      resolvedAim.normalize();
    }
    const isSnipePose = this.skillSnipeActiveUntil > this.time.now || this.playerVisualState === 'aim';
    const forwardOffset = isSnipePose ? 24 : 20;
    const verticalBase = isSnipePose ? 4 : 1;
    const sideOffset = resolvedAim.x < 0 ? -2.2 : 2.2;
    return new Phaser.Math.Vector2(
      this.player.x + resolvedAim.x * forwardOffset + resolvedAim.y * sideOffset,
      this.player.y + verticalBase + resolvedAim.y * 9,
    );
  }

  private playSfx(type: 'shot' | 'scan' | 'snipeCharge' | 'snipeFire' | 'eShot' | 'dash' | 'hurt'): void {
    if (type === 'shot') {
      if (this.playLoadedSfx(['sfx_shouyue_basic_a', 'sfx_shouyue_basic_b'], 0.4, Phaser.Math.FloatBetween(0.985, 1.015))) {
        return;
      }
    }

    if (type === 'snipeCharge') {
      if (this.playLoadedSfx(['sfx_shouyue_snipe_charge_a', 'sfx_shouyue_snipe_charge_b'], 0.46, Phaser.Math.FloatBetween(0.99, 1.01))) {
        return;
      }
    }

    if (type === 'snipeFire') {
      if (this.playLoadedSfx(['sfx_shouyue_snipe_fire_a', 'sfx_shouyue_snipe_fire_b'], 0.74, Phaser.Math.FloatBetween(0.97, 1.0))) {
        return;
      }
    }

    if (type === 'eShot') {
      if (this.playLoadedSfx([...E_SKILL_SHOT_SFX_KEYS], 0.74, Phaser.Math.FloatBetween(0.97, 1.0))) {
        return;
      }
      if (!this.eShotSfxWarned) {
        this.eShotSfxWarned = true;
        this.hudHint.setText('E 技能音效文件未加载，当前使用备用提示音。');
      }
    }

    if (type === 'dash') {
      if (this.playLoadedSfx(['sfx_shouyue_dash'], 0.5, Phaser.Math.FloatBetween(0.99, 1.01))) {
        return;
      }
    }

    this.ensureAudioReady();
    if (!this.audioCtx) return;
    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    if (type === 'shot') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(95, now + 0.09);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.11);
      return;
    }

    if (type === 'scan') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.2);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.24);
      return;
    }

    if (type === 'eShot') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(170, now + 0.14);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.start(now);
      osc.stop(now + 0.18);
      return;
    }

    if (type === 'snipeCharge' || type === 'snipeFire') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(type === 'snipeCharge' ? 280 : 120, now);
      osc.frequency.exponentialRampToValueAtTime(type === 'snipeCharge' ? 980 : 680, now + (type === 'snipeCharge' ? 0.18 : 0.12));
      gain.gain.setValueAtTime(type === 'snipeCharge' ? 0.1 : 0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (type === 'snipeCharge' ? 0.22 : 0.16));
      osc.start(now);
      osc.stop(now + (type === 'snipeCharge' ? 0.24 : 0.18));
      return;
    }

    if (type === 'dash') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.12);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.16);
      return;
    }

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.15);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  private setPlayerVisualState(state: PlayerState, holdMs = 0, force = false): void {
    const now = this.time.now;
    const nextPriority = PLAYER_STATE_PRIORITY[state];
    if (!force && now < this.playerStateUntil && nextPriority < this.playerStateLockPriority) return;
    if (holdMs > 0) {
      this.playerStateUntil = now + holdMs;
      this.playerStateLockPriority = nextPriority;
    } else if (now >= this.playerStateUntil) {
      this.playerStateLockPriority = 0;
    }
    this.playerVisualState = state;
    const textureMap: Record<PlayerState, string> = {
      idle: 'shouyue_state_idle',
      walk: 'shouyue_state_walk',
      aim: 'shouyue_state_aim',
      fire: 'shouyue_state_fire',
      hurt: 'shouyue_state_hurt',
    };
    const key = textureMap[state];
    if (this.textures.exists(key) && this.player.texture.key !== key) {
      this.player.setTexture(key);
      this.applyPlayerBodyHitbox();
    }
  }

  private playStoryIntro(): void {
    this.showNpcDialog(STORY_INTRO_LINES[0]);
    this.time.delayedCall(4800, () => {
      this.showNpcDialog(STORY_INTRO_LINES[1]);
    });
    if (this.aiAssistantEnabled) {
      this.time.delayedCall(9200, () => {
        this.showNpcDialog(STORY_INTRO_LINES[2]);
      });
    }
  }

  update(time: number, delta: number): void {
    if (this.resultShown) return;
    this.elapsedMs += delta;
    if (Phaser.Input.Keyboard.JustDown(this.keys.H)) {
      this.toggleHudVisibility();
    }
    this.updatePressure(time);
    this.updateStoneGolemSpawning(time);
    this.handleSlotSwitch();
    this.handleQuickUseItems();
    this.handleSkills(time);
    this.handleReload(time);
    this.updateRecoveryUse(time);
    this.updateReloadProgress(time);
    this.movePlayer(delta);
    this.updateEnemies();
    this.updateNpcs(time, delta);
    this.handleCombat(time);
    this.handleInteraction();
    this.updateInteractionFocus();
    this.updateUi();
    this.updateHotbar();
    this.updateCrosshair();
    this.updatePseudo3DDepth();
    this.checkWinLose();
  }

  private handleQuickUseItems(): void {
    if (this.isDialogueOpen() || this.lootPanelOpen || this.resultShown) return;
    if (this.recoveryUseUntil > this.time.now) return;
    if (!Phaser.Input.Keyboard.JustDown(this.keys.FIVE)) return;
    this.tryUseRecoveryConsumable();
  }

  private tryUseRecoveryConsumable(): void {
    if (this.hp >= 100) {
      this.hudHint.setText('生命值已满，暂时不需要使用消耗品。');
      return;
    }

    if (this.beginRecoveryUse('campfire_meal', CAMPFIRE_MEAL_HEAL, '篝火熟食')) return;
    if (this.beginRecoveryUse('herbal_pouch', HERBAL_POUCH_HEAL, '草药包')) return;
    if (this.beginRecoveryUse('bandage_roll', BANDAGE_ROLL_HEAL, '绷带')) return;

    this.hudHint.setText('背包中没有可用恢复品（熟食 / 草药包 / 绷带）。');
  }

  private beginRecoveryUse(itemId: string, healAmount: number, label: string): boolean {
    if (this.getInventoryItemCount(itemId) <= 0) return false;
    const consumed = this.consumeInventoryItem(itemId, 1);
    if (consumed <= 0) return false;
    this.recoveryUseUntil = this.time.now + RECOVERY_USE_DURATION_MS;
    this.recoveryUseItemLabel = label;
    this.recoveryUseHealAmount = healAmount;
    this.hudHint.setText(`正在使用${label}...`);
    return true;
  }

  private updateRecoveryUse(time: number): void {
    if (this.recoveryUseUntil <= 0 || this.recoveryUseItemLabel.length === 0) {
      this.recoveryProgressBar.clear();
      this.recoveryProgressBar.setVisible(false);
      this.recoveryProgressLabel.setVisible(false);
      return;
    }

    const remain = this.recoveryUseUntil - time;
    const ratio = Phaser.Math.Clamp(1 - Math.max(0, remain) / RECOVERY_USE_DURATION_MS, 0, 1);
    const barWidth = 76;
    const barHeight = 12;
    const fillHeight = 6;
    const barX = this.player.x - barWidth * 0.5;
    const barY = this.player.y - Math.max(44, Math.round(this.player.displayHeight * 0.78)) + 10;

    this.recoveryProgressBar
      .setVisible(true)
      .clear();
    this.recoveryProgressBar.fillStyle(0x000000, 0.45);
    this.recoveryProgressBar.fillRoundedRect(barX, barY, barWidth, barHeight, 4);
    this.recoveryProgressBar.lineStyle(1.5, 0x9fbeb4, 0.9);
    this.recoveryProgressBar.strokeRoundedRect(barX, barY, barWidth, barHeight, 4);
    this.recoveryProgressBar.fillStyle(0x6ec9aa, 0.95);
    this.recoveryProgressBar.fillRoundedRect(barX + 4, barY + 3, Math.max(0, (barWidth - 8) * ratio), fillHeight, 3);

    this.recoveryProgressLabel
      .setVisible(true)
      .setText(`使用${this.recoveryUseItemLabel}`)
      .setPosition(this.player.x, barY - 2);

    if (remain > 0) return;

    const recovered = this.healPlayer(this.recoveryUseHealAmount);
    this.hudHint.setText(`使用${this.recoveryUseItemLabel}，恢复 ${recovered} 点生命值。`);
    this.showBannerMessage(`${this.recoveryUseItemLabel}生效 +${recovered} HP`, 1300);
    this.recoveryUseUntil = 0;
    this.recoveryUseItemLabel = '';
    this.recoveryUseHealAmount = 0;
    this.recoveryProgressBar.clear();
    this.recoveryProgressBar.setVisible(false);
    this.recoveryProgressLabel.setVisible(false);
  }

  private updateReloadProgress(time: number): void {
    if (this.reloadFinishAt <= time || this.reloadDurationMs <= 0) {
      this.reloadProgressBar.clear();
      this.reloadProgressBar.setVisible(false);
      this.reloadProgressLabel.setVisible(false);
      return;
    }

    const remain = this.reloadFinishAt - time;
    const ratio = Phaser.Math.Clamp(1 - Math.max(0, remain) / this.reloadDurationMs, 0, 1);
    const barWidth = 76;
    const barHeight = 12;
    const fillHeight = 6;
    const barX = this.player.x - barWidth * 0.5;
    const barY = this.player.y - Math.max(62, Math.round(this.player.displayHeight * 1.02)) + 10;

    this.reloadProgressBar
      .setVisible(true)
      .clear();
    this.reloadProgressBar.fillStyle(0x000000, 0.45);
    this.reloadProgressBar.fillRoundedRect(barX, barY, barWidth, barHeight, 4);
    this.reloadProgressBar.lineStyle(1.5, 0xdcb680, 0.95);
    this.reloadProgressBar.strokeRoundedRect(barX, barY, barWidth, barHeight, 4);
    this.reloadProgressBar.fillStyle(0xf5d28a, 0.95);
    this.reloadProgressBar.fillRoundedRect(barX + 4, barY + 3, Math.max(0, (barWidth - 8) * ratio), fillHeight, 3);

    this.reloadProgressLabel
      .setVisible(true)
      .setText('换弹中')
      .setPosition(this.player.x, barY - 2);
  }

  private healPlayer(amount: number): number {
    const hpBefore = this.hp;
    this.hp = Math.min(100, this.hp + amount);
    return this.hp - hpBefore;
  }

  private getInventoryItemCount(id: string): number {
    const stack = this.inventory.find((item) => item.id === id);
    return stack ? stack.count : 0;
  }

  private consumeInventoryItem(id: string, count: number): number {
    const stack = this.inventory.find((item) => item.id === id && item.count > 0);
    if (!stack) return 0;
    const consumed = Math.min(count, stack.count);
    stack.count -= consumed;
    if (stack.count <= 0) {
      this.inventory = this.inventory.filter((item) => item !== stack);
    }
    return consumed;
  }

  private tryCraftCampfireMeal(): void {
    const totalMeat = this.getInventoryItemCount(CAMPFIRE_CRAFT_SOURCE_ID);
    if (totalMeat < CAMPFIRE_CRAFT_COST) {
      this.hudHint.setText('赤甲肉不足，请在野外搜索。');
      this.showBannerMessage('赤甲肉不足，请在野外搜索。', 1700);
      return;
    }

    const consumed = this.consumeInventoryItem(CAMPFIRE_CRAFT_SOURCE_ID, CAMPFIRE_CRAFT_COST);
    if (consumed < CAMPFIRE_CRAFT_COST) {
      if (consumed > 0) {
        const sourceMeta = getSupplyItem(CAMPFIRE_CRAFT_SOURCE_ID);
        if (sourceMeta) this.pushItem(this.inventory, { ...sourceMeta, count: consumed });
      }
      this.hudHint.setText('篝火合成失败：赤甲肉扣除异常。');
      return;
    }

    const craftedMeta = getSupplyItem(CAMPFIRE_CRAFT_OUTPUT_ID);
    if (!craftedMeta) {
      const sourceMeta = getSupplyItem(CAMPFIRE_CRAFT_SOURCE_ID);
      if (sourceMeta) this.pushItem(this.inventory, { ...sourceMeta, count: CAMPFIRE_CRAFT_COST });
      this.hudHint.setText('篝火合成失败：熟食配置缺失。');
      return;
    }

    const craftedMeal: ItemStack = {
      ...craftedMeta,
      count: 1,
    };

    if (!this.canStoreItem(craftedMeal)) {
      const sourceMeta = getSupplyItem(CAMPFIRE_CRAFT_SOURCE_ID);
      if (sourceMeta) this.pushItem(this.inventory, { ...sourceMeta, count: CAMPFIRE_CRAFT_COST });
      this.hudHint.setText('背包已满，无法放入熟食。');
      return;
    }

    this.pushItem(this.inventory, craftedMeal);
    this.syncObjectiveProgress();
    this.hudHint.setText(`篝火合成完成：消耗 ${CAMPFIRE_CRAFT_COST} 片赤甲肉，获得熟食。`);
    this.showBannerMessage('熟食 +1（按 5 使用）', 1400);
  }

  private consumeCriticalSuppliesForSubmit(needCount: number): number {
    let remain = needCount;
    for (let i = this.inventory.length - 1; i >= 0 && remain > 0; i -= 1) {
      const stack = this.inventory[i];
      if (!isCriticalSupply(stack.id) || stack.count <= 0) continue;
      const used = Math.min(stack.count, remain);
      stack.count -= used;
      remain -= used;
      if (stack.count <= 0) {
        this.inventory.splice(i, 1);
      }
    }
    return needCount - remain;
  }

  private trySubmitCriticalSupplies(): void {
    if (this.suppliesDelivered) {
      this.hudHint.setText('关键补给已提交，行动结算中。');
      return;
    }

    if (this.objectiveCollected < this.objectiveNeed) {
      const remain = this.objectiveNeed - this.objectiveCollected;
      this.hudHint.setText(`提交失败：关键补给不足，还需 ${remain} 份。`);
      return;
    }

    const submitted = this.consumeCriticalSuppliesForSubmit(this.objectiveNeed);
    if (submitted < this.objectiveNeed) {
      this.syncObjectiveProgress();
      this.hudHint.setText('提交失败：关键补给校验异常。');
      return;
    }

    this.suppliesDelivered = true;
    this.syncObjectiveProgress();
    this.showResult(getMissionSuccessText(this.objectiveNeed));
  }

  private updatePressure(time: number): void {
    const enemyPressure = this.enemies.length * 3.2;
    const hpPressure = (100 - this.hp) * 0.35;
    const timePressure = (this.elapsedMs / 1000) * 1.1;
    this.pressure = Phaser.Math.Clamp(enemyPressure + hpPressure + timePressure, 0, 100);

    if (time >= this.reinforceAt && this.enemies.length < 18) {
      this.spawnEnemyAtEdge();
      this.reinforceAt += this.missionConfig.mode === 'pressure' ? 9000 : 14000;
      this.hudHint.setText('敌方增援正在逼近，先稳住防线，再继续外圈搜集。');
    }
  }

  private updateStoneGolemSpawning(time: number): void {
    if (this.resultShown || this.activeStoneGolemType) return;
    if (time < this.nextStoneGolemSpawnAt) return;

    const remaining = STONE_GOLEM_TYPES.filter((type) => !this.stoneGolemSpawned[type]);
    if (remaining.length === 0) {
      this.nextStoneGolemSpawnAt = Number.POSITIVE_INFINITY;
      return;
    }

    const nextType = remaining.length === 2
      ? remaining[Phaser.Math.Between(0, 1)]
      : remaining[0];

    if (!this.spawnStoneGolem(nextType)) {
      this.nextStoneGolemSpawnAt = time + 1800;
      return;
    }

    this.stoneGolemSpawned[nextType] = true;
    this.activeStoneGolemType = nextType;
    this.nextStoneGolemSpawnAt = Number.POSITIVE_INFINITY;
    const golemName = nextType === 'crimson_statue' ? '猩红石像' : '蔚蓝石像';
    this.showBannerMessage(`警戒：${golemName}已出现`, 2200);
    this.hudHint.setText(`警戒：${golemName}已出现，优先集火。`);
  }

  private spawnStoneGolem(type: StoneGolemType): boolean {
    const point = this.pickStoneGolemSpawnPoint(type);
    if (!point) return false;
    return Boolean(this.spawnEnemy(point.x, point.y, 'elite', type));
  }

  private pickStoneGolemSpawnPoint(type: StoneGolemType): { x: number; y: number } | undefined {
    const points = Phaser.Utils.Array.Shuffle([...STONE_GOLEM_SPAWN_POINTS[type]]);
    for (const point of points) {
      if (this.isInsideInnerWall(point.x, point.y)) continue;
      if (Phaser.Math.Distance.Between(point.x, point.y, this.player.x, this.player.y) < 420) continue;
      if (this.enemies.some((enemy) => Phaser.Math.Distance.Between(point.x, point.y, enemy.sprite.x, enemy.sprite.y) < 120)) continue;
      return point;
    }
    return points[0];
  }

  private handleStoneGolemDefeated(type: StoneGolemType): void {
    if (this.activeStoneGolemType === type) {
      this.activeStoneGolemType = undefined;
    }
    const hasRemaining = STONE_GOLEM_TYPES.some((golemType) => !this.stoneGolemSpawned[golemType]);
    this.nextStoneGolemSpawnAt = hasRemaining
      ? this.time.now + STONE_GOLEM_SECOND_SPAWN_DELAY_MS
      : Number.POSITIVE_INFINITY;
  }

  private getNearestEnemyDistance(x: number, y: number): number {
    let nearest = Number.POSITIVE_INFINITY;
    for (const enemy of this.enemies) {
      const dist = Phaser.Math.Distance.Between(x, y, enemy.sprite.x, enemy.sprite.y);
      if (dist < nearest) nearest = dist;
    }
    return nearest;
  }

  private setNpcState(npc: NpcUnit, state: NpcUnit['state'], time: number, holdMin = 650, holdMax = 1400): void {
    npc.state = state;
    npc.stateUntil = time + Phaser.Math.Between(holdMin, holdMax);
  }

  private assignNextNpcPatrolTarget(npc: NpcUnit): void {
    if (npc.patrolRoute.length === 0) return;
    npc.patrolIndex = (npc.patrolIndex + 1) % npc.patrolRoute.length;
    npc.target.copy(npc.patrolRoute[npc.patrolIndex]);
  }

  private tryNpcBattlefieldLine(npc: NpcUnit, time: number, playerDist: number, nearestEnemy: number): void {
    if (!this.aiAssistantEnabled) return;
    if (this.dialogueOverlay?.isVisible() || this.lootPanelOpen || this.resultShown) return;
    if (this.npcDialog.visible || time < npc.talkCooldownUntil || playerDist > 340) return;

    let line: string | null = null;
    if (npc.name === '花木兰') {
      if (this.objectiveCollected >= this.objectiveNeed) line = '花木兰：\n补给已齐，回主城提交处，我来掩护。';
      else if (this.pressure >= 75) line = '花木兰：\n外圈压力上升，先守住城门。';
    } else if (npc.name === '铠') {
      if (nearestEnemy < 190) line = '铠：\n近战冲过来了，我去前压。';
      else if (this.hp <= 45) line = '铠：\n你先稳血线，我来顶住。';
    } else {
      if (this.objectiveCollected < this.objectiveNeed && playerDist > 170) line = '百里玄策：\n你去收补给，我来清外围。';
      else if (this.pressure >= 70) line = '百里玄策：\n魔种越聚越多，我去拉扯阵线。';
    }

    if (!line) return;
    npc.talkCooldownUntil = time + Phaser.Math.Between(12000, 18000);
    this.showNpcDialog(line);
  }

  private updateNpcs(time: number, delta: number): void {
    const dt = delta / 1000;
    for (const npc of this.npcs) {
      const playerDist = Phaser.Math.Distance.Between(npc.sprite.x, npc.sprite.y, this.player.x, this.player.y);
      const nearestEnemy = this.getNearestEnemyDistance(npc.sprite.x, npc.sprite.y);
      const route = npc.patrolRoute;

      if (npc.name === '花木兰') {
        const gatePoint = route[1] ?? route[0];
        if (this.pressure >= 70 || nearestEnemy < 230) {
          npc.target.copy(gatePoint);
          this.setNpcState(npc, 'warn', time, 900, 1600);
        } else if (time >= npc.stateUntil && npc.state !== 'observe') {
          this.setNpcState(npc, 'observe', time, 900, 1800);
        } else if (time >= npc.stateUntil) {
          npc.target.copy(route[(npc.patrolIndex + 1) % route.length] ?? gatePoint);
          this.assignNextNpcPatrolTarget(npc);
          this.setNpcState(npc, 'patrol', time, 1100, 1900);
        }
      } else if (npc.name === '铠') {
        const supportAimX = Math.abs(this.aimDir.x) < 0.25
          ? (npc.facingLeft ? -1 : 1)
          : this.aimDir.x;
        const supportPoint = playerDist > 180
          ? new Phaser.Math.Vector2(
              Phaser.Math.Clamp(this.player.x - supportAimX * 90, 760, 1420),
              Phaser.Math.Clamp(this.player.y - this.aimDir.y * 70, 1660, 2010),
            )
          : route[npc.patrolIndex] ?? new Phaser.Math.Vector2(npc.sprite.x, npc.sprite.y);
        if (nearestEnemy < 220 || this.pressure >= 68) {
          npc.target.copy(supportPoint);
          this.setNpcState(npc, 'support', time, 700, 1300);
        } else if (time >= npc.stateUntil) {
          this.assignNextNpcPatrolTarget(npc);
          this.setNpcState(npc, 'patrol', time, 900, 1600);
        }
      } else {
        if (time >= npc.stateUntil || Phaser.Math.Distance.Between(npc.sprite.x, npc.sprite.y, npc.target.x, npc.target.y) < 24) {
          const leap = Phaser.Math.Between(1, Math.min(2, route.length - 1));
          npc.patrolIndex = (npc.patrolIndex + leap) % route.length;
          npc.target.copy(route[npc.patrolIndex]);
          this.setNpcState(npc, Phaser.Math.Between(0, 1) === 0 ? 'patrol' : 'observe', time, 420, 1100);
        }
        if (this.pressure >= 72 && nearestEnemy < 260) {
          npc.state = 'warn';
        }
      }

      const toTarget = new Phaser.Math.Vector2(npc.target.x - npc.sprite.x, npc.target.y - npc.sprite.y);
      const distance = toTarget.length();
      let speedScale = 0;
      if (npc.state === 'patrol') speedScale = npc.name === '百里玄策' ? 1 : 0.7;
      else if (npc.state === 'support') speedScale = 0.95;
      else if (npc.state === 'warn') speedScale = 0.65;
      else if (npc.state === 'guard') speedScale = 0.45;
      else speedScale = distance > 34 ? 0.35 : 0;

      if (distance > 10 && speedScale > 0) {
        const targetDx = npc.target.x - npc.sprite.x;
        const step = Math.min(distance, npc.speed * speedScale * dt);
        toTarget.normalize().scale(step);
        npc.sprite.x += toTarget.x;
        npc.sprite.y += toTarget.y;
        // Keep facing stable when movement is nearly vertical to avoid frame-by-frame flip jitter.
        if (Math.abs(targetDx) > 6) {
          npc.facingLeft = targetDx < 0;
        }
        const reverseFacing = npc.name === '铠';
        npc.sprite.setFlipX(reverseFacing ? !npc.facingLeft : npc.facingLeft);
      }

      const bob = npc.state === 'observe' ? Math.sin((time + npc.sprite.x) * 0.005) * 1.5 : 0;
      npc.shadow.x = npc.sprite.x;
      npc.shadow.y = npc.sprite.y + NPC_SHADOW_Y_OFFSET;
      npc.label.x = npc.sprite.x;
      npc.label.y = npc.sprite.y - NPC_LABEL_Y_OFFSET + bob;
      npc.label.setAlpha(npc.state === 'warn' ? 1 : 0.92);
      npc.sprite.setAlpha(npc.state === 'warn' ? 1 : 0.96);

      this.tryNpcBattlefieldLine(npc, time, playerDist, nearestEnemy);
    }
  }

  private movePlayer(delta: number): void {
    const lockInput = this.lootPanelOpen || this.resultShown || this.dialogueOverlay?.isVisible() || this.recoveryUseUntil > this.time.now;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (lockInput) {
      body.setVelocity(0);
      return;
    }

    if (this.skillDashEndAt > this.time.now) {
      body.setVelocity(this.skillDashDir.x * DASH_BACK_SPEED, this.skillDashDir.y * DASH_BACK_SPEED);
      this.playerShadow.x = this.player.x;
      this.playerShadow.y = this.player.y + PLAYER_SHADOW_Y_OFFSET;
      return;
    }

    if (this.skillSnipeActiveUntil > this.time.now) {
      body.setVelocity(0);
      this.playerShadow.x = this.player.x;
      this.playerShadow.y = this.player.y + PLAYER_SHADOW_Y_OFFSET;
      const aim = this.resolveAimDirection();
      this.aimDir.copy(aim);
      this.player.setFlipX(this.aimDir.x < 0);
      this.setPlayerVisualState('aim');
      return;
    }

    const baseSpeed = 176;
    const sprinting = this.keys.SHIFT.isDown && this.stamina > 6;
    const speed = sprinting ? 272 : baseSpeed;
    body.setVelocity(0);
    if (this.keys.W.isDown || this.cursors.up.isDown) body.setVelocityY(-speed);
    if (this.keys.S.isDown || this.cursors.down.isDown) body.setVelocityY(speed);
    if (this.keys.A.isDown || this.cursors.left.isDown) body.setVelocityX(-speed);
    if (this.keys.D.isDown || this.cursors.right.isDown) body.setVelocityX(speed);
    body.velocity.normalize().scale(speed);

    if (sprinting && body.velocity.lengthSq() > 0) this.stamina = Math.max(0, this.stamina - delta * 0.04);
    else this.stamina = Math.min(100, this.stamina + delta * 0.034);

    this.playerShadow.x = this.player.x;
    this.playerShadow.y = this.player.y + PLAYER_SHADOW_Y_OFFSET;

    const aim = this.resolveAimDirection();
    this.aimDir.copy(aim);
    this.player.setFlipX(this.aimDir.x < 0);

    if (this.time.now >= this.playerStateUntil) {
      this.playerStateLockPriority = 0;
      if (body.velocity.lengthSq() > 0) {
        this.setPlayerVisualState('walk');
      } else {
        this.setPlayerVisualState('idle');
      }
    }

    this.resolveGreatWallBarrier(body);
  }

  private updateEnemies(): void {
    const playerInBush = this.isPointInsideBush(this.player.x, this.player.y);
    if (playerInBush) {
      this.player.setTint(0xb8b8b8);
      this.player.setAlpha(0.82);
      this.playerShadow.setAlpha(0.2);
    } else {
      this.player.setTint(0xffffff);
      this.player.setAlpha(1);
      this.playerShadow.setAlpha(0.35);
    }
    for (const enemy of this.enemies) {
      const body = enemy.sprite.body as Phaser.Physics.Arcade.Body;
      if (this.isInsideInnerWall(enemy.sprite.x, enemy.sprite.y) && !this.isInsideGateCorridor(enemy.sprite.x, enemy.sprite.y)) {
        enemy.sprite.y = FORTRESS_TOP - 30;
        body.setVelocityY(-120);
      }

      const target = new Phaser.Math.Vector2();
      const playerInSafeZone = this.isInsideInnerWall(this.player.x, this.player.y) && !this.isInsideGateCorridor(this.player.x, this.player.y);
      const toPlayer = new Phaser.Math.Vector2(this.player.x - enemy.sprite.x, this.player.y - enemy.sprite.y);
      const playerDist = toPlayer.length();
      const shouldChasePlayer = !playerInSafeZone && !playerInBush && playerDist < enemy.chaseRadius;

      if (shouldChasePlayer) {
        target.copy(this.player);
      } else {
        if (this.time.now >= enemy.nextRetargetAt || Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, enemy.anchor.x, enemy.anchor.y) < 24) {
          enemy.anchor.set(
            Phaser.Math.Clamp(enemy.anchor.x + Phaser.Math.Between(-260, 260), 1760, WORLD_WIDTH - 160),
            Phaser.Math.Clamp(enemy.anchor.y + Phaser.Math.Between(-220, 220), 180, WORLD_HEIGHT - 140),
          );
          if (this.isInsideInnerWall(enemy.anchor.x, enemy.anchor.y)) {
            enemy.anchor.y = FORTRESS_TOP - Phaser.Math.Between(120, 260);
          }
          enemy.nextRetargetAt = this.time.now + Phaser.Math.Between(1500, 3200);
        }
        target.copy(enemy.anchor);
      }

      if (enemy.kind === 'boss') {
        if (shouldChasePlayer && this.time.now >= (enemy.burstReadyAt ?? 0) && playerDist < 240) {
          const dash = toPlayer.clone().normalize().scale(300);
          body.setVelocity(dash.x, dash.y);
          enemy.burstReadyAt = this.time.now + 5000;
        }
      }

      const steering = new Phaser.Math.Vector2(target.x - enemy.sprite.x, target.y - enemy.sprite.y);
      if (steering.lengthSq() > 0) {
        steering.normalize();
      }

      const edgePush = new Phaser.Math.Vector2();
      if (enemy.sprite.x < 130) edgePush.x += 1;
      if (enemy.sprite.x > WORLD_WIDTH - 130) edgePush.x -= 1;
      if (enemy.sprite.y < 120) edgePush.y += 1;
      if (enemy.sprite.y > WORLD_HEIGHT - 120) edgePush.y -= 1;

      const separation = new Phaser.Math.Vector2();
      for (const other of this.enemies) {
        if (other === enemy) continue;
        const dx = enemy.sprite.x - other.sprite.x;
        const dy = enemy.sprite.y - other.sprite.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > 0 && distSq < 90 * 90) {
          separation.x += dx / distSq;
          separation.y += dy / distSq;
        }
      }

      const velocity = steering.scale(shouldChasePlayer ? enemy.speed + this.pressure * 0.35 : enemy.speed * 0.72)
        .add(edgePush.scale(90))
        .add(separation.scale(6200));
      body.setVelocity(velocity.x, velocity.y);
      const maxSpeed = shouldChasePlayer ? enemy.speed + 8 : enemy.speed * 0.75;
      if (body.velocity.lengthSq() > maxSpeed ** 2) {
        body.velocity.normalize().scale(maxSpeed);
      }

      if (
        playerDist < (enemy.kind === 'boss' ? 50 : enemy.kind === 'elite' ? 38 : 34) &&
        !playerInSafeZone &&
        !playerInBush &&
        this.time.now - enemy.lastAttackAt > (enemy.kind === 'boss' ? 760 : enemy.kind === 'elite' ? 540 : 620)
      ) {
        const damage = enemy.kind === 'boss'
          ? (this.hp < 45 ? this.hp : enemy.attackDamage)
          : enemy.attackDamage + Math.floor(this.pressure / (enemy.kind === 'elite' ? 28 : 35));
        this.hp = Math.max(0, this.hp - damage);
        enemy.lastAttackAt = this.time.now;
        this.setPlayerVisualState('hurt', 220);
        this.playSfx('hurt');
        this.cameras.main.shake(enemy.kind === 'boss' ? 120 : 85, enemy.kind === 'boss' ? 0.006 : 0.004);
      }

      const marked = this.isPointRevealedByScout(enemy.sprite.x, enemy.sprite.y);
      const hiddenByBush = this.isPointInsideBush(enemy.sprite.x, enemy.sprite.y) && !marked;
      const baseAlpha = enemy.kind === 'boss' && (enemy.stealthUntil ?? 0) > this.time.now ? 0.28 : 1;
      if (hiddenByBush) {
        enemy.sprite.setVisible(false);
        enemy.shadow.setVisible(false);
      } else {
        enemy.sprite.setVisible(true);
        enemy.shadow.setVisible(true);
        enemy.sprite.setAlpha(baseAlpha);
        enemy.sprite.setTint(marked ? 0xffc38d : 0xffffff);
      }
      enemy.shadow.x = enemy.sprite.x;
      enemy.shadow.y = enemy.sprite.y + ENEMY_SHADOW_Y_OFFSET;
      enemy.sprite.x = Phaser.Math.Clamp(enemy.sprite.x, 22, WORLD_WIDTH - 22);
      enemy.sprite.y = Phaser.Math.Clamp(enemy.sprite.y, 22, WORLD_HEIGHT - 22);
    }
  }

  private handleCombat(time: number): void {
    if (this.isDialogueOpen()) return;
    if (this.lootPanelOpen || this.resultShown || this.reloadFinishAt > time) return;
    const pointer = this.input.activePointer;
    const weapon = this.currentWeapon();
    const pointerDown = pointer.leftButtonDown();

    const triggerPressed = weapon.auto ? pointerDown : (pointerDown && !this.pointerWasDown);
    this.pointerWasDown = pointerDown;
    if (!triggerPressed || time - this.lastFireAt < weapon.fireDelay) return;

    const currentMag = this.weaponMags[weapon.id];
    if (currentMag <= 0) {
      this.hudHint.setText('弹药不足，请换弹');
      return;
    }

    this.lastFireAt = time;
    this.weaponMags[weapon.id] = currentMag - 1;
    this.fireProjectile(weapon);
  }

  private fireProjectile(weapon: WeaponConfig, shotMode?: 'basic' | 'snipe' | 'dash'): void {
    const pointer = this.input.activePointer;
    const dir = this.resolveAimDirection(pointer);
    const muzzleOrigin = this.getMuzzleWorldPosition(dir);
    const bullet = this.bullets.get(muzzleOrigin.x, muzzleOrigin.y, 'bullet_model') as Phaser.Physics.Arcade.Image | null;
    if (!bullet) return;
    bullet.setActive(true).setVisible(true).setDisplaySize(10, 10).setDepth(7);
    bullet.setData('consumed', false);
    const bulletBody = bullet.body as Phaser.Physics.Arcade.Body | undefined;
    if (bulletBody) bulletBody.enable = true;

    const spread = Phaser.Math.DegToRad(Phaser.Math.FloatBetween(-weapon.spreadDeg, weapon.spreadDeg));
    const rotated = dir.clone().rotate(spread);
    const resolvedShotMode = shotMode ?? (this.skillSnipeActiveUntil > this.time.now ? 'snipe' : 'basic');
    const isSnipeShot = resolvedShotMode === 'snipe';
    const projectileSpeed = resolvedShotMode === 'snipe' ? weapon.projectileSpeed * 1.2 : weapon.projectileSpeed;
    const bulletDamage = resolvedShotMode === 'dash' ? 320 : resolvedShotMode === 'snipe' ? 300 : 280;
    const bulletRange = resolvedShotMode === 'snipe' ? SNIPE_ATTACK_RANGE : NORMAL_ATTACK_RANGE;
    const lifeMs = Math.floor((bulletRange / projectileSpeed) * 1000);
    bullet.setData('damage', bulletDamage);
    bullet.setVelocity(rotated.x * projectileSpeed, rotated.y * projectileSpeed);
    bullet.setData('range', bulletRange);
    if (isSnipeShot) {
      bullet.setTint(0xffd38a);
      this.playSfx('eShot');
      this.skillSnipeActiveUntil = this.time.now + 220;
    } else if (resolvedShotMode === 'dash') {
      bullet.setTint(0xb9d9ff);
      this.playSfx('dash');
    } else {
      bullet.setTint(0xffffff);
      this.playSfx('shot');
    }
    this.cameras.main.shake(
      isSnipeShot ? 80 : resolvedShotMode === 'dash' ? 60 : 42,
      isSnipeShot ? 0.0042 : resolvedShotMode === 'dash' ? 0.0032 : 0.0022,
    );
    this.setPlayerVisualState('fire', 140);

    const muzzle = this.add.circle(
      muzzleOrigin.x + rotated.x * 6,
      muzzleOrigin.y + rotated.y * 6,
      resolvedShotMode === 'snipe' ? 9 : resolvedShotMode === 'dash' ? 7 : 6,
      0xffe6b8,
      0.9,
    ).setDepth(1200);
    this.tweens.add({
      targets: muzzle,
      alpha: 0,
      scaleX: 0.12,
      scaleY: 0.12,
      duration: isSnipeShot ? 124 : 100,
      onComplete: () => muzzle.destroy(),
    });

    for (let i = 0; i < (isSnipeShot ? 6 : 4); i += 1) {
        const spark = this.add.circle(
          muzzleOrigin.x + rotated.x * 12,
          muzzleOrigin.y + rotated.y * 12,
          Phaser.Math.Between(2, 4),
          isSnipeShot ? 0xffbf63 : 0xffe7b8,
          0.95,
      ).setDepth(1190);
      this.tweens.add({
        targets: spark,
        x: spark.x + rotated.x * Phaser.Math.Between(24, 44) + Phaser.Math.Between(-8, 8),
        y: spark.y + rotated.y * Phaser.Math.Between(24, 44) + Phaser.Math.Between(-8, 8),
        alpha: 0,
        duration: isSnipeShot ? 190 : 150,
        onComplete: () => spark.destroy(),
      });
    }

    this.time.delayedCall(lifeMs, () => {
      if (bullet.active) bullet.setActive(false).setVisible(false).setVelocity(0);
    });
  }

  private handleReload(time: number): void {
    const weapon = this.currentWeapon();
    if (this.reloadFinishAt > time) {
      if (this.reloadFinishAt - time < 30) {
        this.finishReload();
      }
      return;
    }
    if (!Phaser.Input.Keyboard.JustDown(this.keys.R)) return;
    const mag = this.weaponMags[weapon.id];
    if (mag >= weapon.magSize) return;
    const ammoType = weapon.ammoType;
    if (!ammoType || this.reserveAmmo[ammoType] <= 0) {
      this.hudHint.setText('没有可用弹药了。');
      return;
    }
    this.reloadStartAt = time;
    this.reloadDurationMs = weapon.reloadMs;
    this.reloadFinishAt = time + weapon.reloadMs;
    this.hudHint.setText('正在换弹...');
  }

  private finishReload(): void {
    const weapon = this.currentWeapon();
    if (!weapon.ammoType) {
      this.reloadFinishAt = 0;
      this.reloadStartAt = 0;
      this.reloadDurationMs = 0;
      return;
    }
    const need = weapon.magSize - this.weaponMags[weapon.id];
    const reserve = this.reserveAmmo[weapon.ammoType];
    const load = Math.min(need, reserve);
    this.weaponMags[weapon.id] += load;
    this.reserveAmmo[weapon.ammoType] -= load;
    this.reloadFinishAt = 0;
    this.reloadStartAt = 0;
    this.reloadDurationMs = 0;
    this.reloadProgressBar.clear();
    this.reloadProgressBar.setVisible(false);
    this.reloadProgressLabel.setVisible(false);
  }

  private handleSlotSwitch(): void {
    if (this.isDialogueOpen()) return;
    if (Phaser.Input.Keyboard.JustDown(this.keys.TAB) && this.time.now - this.lastBagToggleAt > 180) {
      this.lastBagToggleAt = this.time.now;
      this.lootPanelOpen = !this.lootPanelOpen;
      this.activeLoot = undefined;
      this.refreshLootPanel();
    }
  }

  private handleSkills(time: number): void {
    if (this.isDialogueOpen()) return;
    if (Phaser.Input.Keyboard.JustDown(this.keys.Q) && time >= this.skillScanReadyAt) {
      this.skillScanReadyAt = time + Q_SCAN_COOLDOWN_MS;
      const ring = this.add.circle(this.player.x, this.player.y, Q_SCAN_RADIUS, 0x83b8aa, 0.08).setDepth(20);
      ring.setStrokeStyle(2, 0x8fd3bf, 0.6);
      this.scoutEyes.push({ x: this.player.x, y: this.player.y, expireAt: time + Q_SCAN_DURATION_MS, ring });
      for (let i = 0; i < 2; i += 1) {
        const pulse = this.add.circle(this.player.x, this.player.y, 24, 0x8fd3bf, 0.12).setDepth(19);
        pulse.setStrokeStyle(2, 0x8fd3bf, 0.65);
        this.tweens.add({
          targets: pulse,
          radius: Q_SCAN_RADIUS + 6,
          alpha: 0,
          duration: 760 + i * 220,
          onComplete: () => pulse.destroy(),
        });
      }
      this.playSfx('scan');
      this.hudHint.setText('已展开静谧之眼：侦查范围提升，可短暂显形草丛中的魔种。');
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.E)) {
      if (this.skillSnipeActiveUntil > time) {
        this.skillSnipeActiveUntil = 0;
        this.skillSnipeReadyAt = time;
        this.hudHint.setText('已取消架枪，E 技能冷却未消耗。');
      } else if (time >= this.skillSnipeReadyAt) {
        this.skillSnipeReadyAt = time + 12000;
        this.skillSnipeActiveUntil = time + 4500;
        const glow = this.add.circle(this.player.x, this.player.y, 26, 0xffbf7a, 0.18).setDepth(16);
        glow.setStrokeStyle(2, 0xffd38a, 0.8);
        this.tweens.add({
          targets: glow,
          radius: 78,
          alpha: 0,
          duration: 520,
          onComplete: () => glow.destroy(),
        });
        this.hudHint.setText('狂风之息蓄力启动，原地狙击可锁定更高威胁目标。');
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) && time >= this.skillDashReadyAt) {
      this.skillDashReadyAt = time + 8000;
      this.skillDashEndAt = time + 180;
      this.skillDashDir.set(-this.aimDir.x, -this.aimDir.y);
      this.playSfx('dash');

      const dashWave = this.add.circle(this.player.x, this.player.y, 20, 0x9bd6ff, 0.15).setDepth(18);
      dashWave.setStrokeStyle(2, 0xaed8ff, 0.8);
      this.tweens.add({
        targets: dashWave,
        radius: 72,
        alpha: 0,
        duration: 260,
        onComplete: () => dashWave.destroy(),
      });

      this.hudHint.setText('后撤反击启动，短时拉开距离并压制追兵。');
      this.time.delayedCall(90, () => {
        if (!this.player.active || this.isDialogueOpen()) return;
        this.triggerDashCounterShot();
      });
    }

    this.scoutEyes = this.scoutEyes.filter((eye) => {
      if (time < eye.expireAt) return true;
      eye.ring.destroy();
      return false;
    });
  }

  private getNearbyNpc(maxDistance = 96): NpcUnit | undefined {
    return this.npcs.find((npc) =>
      Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.sprite.x, npc.sprite.y) < maxDistance,
    );
  }

  private getNearbyLoot(maxDistance = 82): LootContainer | undefined {
    return this.lootContainers.find((box) =>
      Phaser.Math.Distance.Between(this.player.x, this.player.y, box.sprite.x, box.sprite.y) < maxDistance,
    );
  }

  private getNearbyCampfire(maxDistance = 90): CampfireStation | undefined {
    if (!this.campfireStation) return undefined;
    const dist = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.campfireStation.sprite.x,
      this.campfireStation.sprite.y,
    );
    return dist < maxDistance ? this.campfireStation : undefined;
  }

  private getNearbySupplySubmit(maxDistance = 92): SupplySubmitStation | undefined {
    if (!this.supplySubmitStation) return undefined;
    const dist = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.supplySubmitStation.sprite.x,
      this.supplySubmitStation.sprite.y,
    );
    return dist < maxDistance ? this.supplySubmitStation : undefined;
  }

  private updateInteractionFocus(): void {
    const nearestNpc = this.getNearbyNpc(112);
    const nearestLoot = this.getNearbyLoot(96);
    const nearestCampfire = this.getNearbyCampfire(108);
    const nearestSubmit = this.getNearbySupplySubmit(112);
    if (this.campfireAwaitConfirm && !nearestCampfire) {
      this.setCampfireConfirmVisible(false);
    }
    const npcDist = nearestNpc ? Phaser.Math.Distance.Between(this.player.x, this.player.y, nearestNpc.sprite.x, nearestNpc.sprite.y) : Number.POSITIVE_INFINITY;
    const lootDist = nearestLoot ? Phaser.Math.Distance.Between(this.player.x, this.player.y, nearestLoot.sprite.x, nearestLoot.sprite.y) : Number.POSITIVE_INFINITY;
    const campfireDist = nearestCampfire
      ? Phaser.Math.Distance.Between(this.player.x, this.player.y, nearestCampfire.sprite.x, nearestCampfire.sprite.y)
      : Number.POSITIVE_INFINITY;
    const submitDist = nearestSubmit
      ? Phaser.Math.Distance.Between(this.player.x, this.player.y, nearestSubmit.sprite.x, nearestSubmit.sprite.y)
      : Number.POSITIVE_INFINITY;

    let nextTarget: typeof this.activeInteractionTarget;
    if (npcDist <= lootDist && npcDist <= campfireDist && npcDist <= submitDist && nearestNpc) nextTarget = { type: 'npc', ref: nearestNpc };
    else if (submitDist <= campfireDist && submitDist <= lootDist && nearestSubmit) nextTarget = { type: 'submit', ref: nearestSubmit };
    else if (campfireDist <= lootDist && nearestCampfire) nextTarget = { type: 'campfire', ref: nearestCampfire };
    else if (nearestLoot) nextTarget = { type: 'loot', ref: nearestLoot };
    else nextTarget = undefined;

    this.activeInteractionTarget = nextTarget;
    if (!nextTarget || this.dialogueOverlay?.isVisible() || this.lootPanelOpen) {
      this.interactionRing.setVisible(false);
      this.interactionWorldHint.setVisible(false);
      return;
    }

    const pulse = 0.6 + Math.sin(this.time.now * 0.01) * 0.16;
    const targetSprite = nextTarget.ref.sprite;
    const ringYOffset = nextTarget.type === 'npc'
      ? Math.max(20, Math.round(targetSprite.displayHeight * 0.35))
      : nextTarget.type === 'campfire'
        ? Math.max(18, Math.round(targetSprite.displayHeight * 0.2))
        : nextTarget.type === 'submit'
          ? Math.max(18, Math.round(targetSprite.displayHeight * 0.26))
          : Math.max(16, Math.round(targetSprite.displayHeight * 0.22));
    const ringScale = nextTarget.type === 'npc'
      ? Phaser.Math.Clamp(targetSprite.displayWidth / 54, 1, 1.7)
      : nextTarget.type === 'campfire'
        ? 0.88
        : nextTarget.type === 'submit'
          ? 0.94
          : 0.92;
    this.interactionRing
      .setVisible(true)
      .setPosition(targetSprite.x, targetSprite.y + ringYOffset)
      .setAlpha(0.35 + pulse * 0.25)
      .setScale(ringScale);
    const worldHintYOffset = Math.max(42, Math.round(targetSprite.displayHeight * 0.52));
    const hintText = nextTarget.type === 'npc'
      ? `F 交谈：${(nextTarget.ref as NpcUnit).name}`
      : nextTarget.type === 'submit'
        ? `F 提交物资：${(nextTarget.ref as SupplySubmitStation).title}`
      : nextTarget.type === 'campfire'
        ? (this.campfireAwaitConfirm
          ? `F 确认烹饪：${(nextTarget.ref as CampfireStation).title}`
          : `F 篝火烹饪：${(nextTarget.ref as CampfireStation).title}`)
        : `F 搜索：${(nextTarget.ref as LootContainer).title}`;
    this.interactionWorldHint
      .setVisible(true)
      .setText(hintText)
      .setPosition(targetSprite.x, targetSprite.y - worldHintYOffset);
  }

  private getContextPrompt(): string {
    const nearbyNpc = this.getNearbyNpc();
    if (nearbyNpc) {
      return `F 交谈：${nearbyNpc.name} | ${nearbyNpc.line}`;
    }

    const nearbyCampfire = this.getNearbyCampfire();
    if (nearbyCampfire) {
      return this.campfireAwaitConfirm
        ? `F 确认烹饪：${nearbyCampfire.title} | 再按 F 合成`
        : `F 篝火烹饪：${nearbyCampfire.title} | ${nearbyCampfire.prompt}`;
    }

    const nearbySubmit = this.getNearbySupplySubmit();
    if (nearbySubmit) {
      if (this.suppliesDelivered) {
        return `F 提交物资：${nearbySubmit.title} | 已完成提交，等待结算`;
      }
      if (this.objectiveCollected >= this.objectiveNeed) {
        return `F 提交物资：${nearbySubmit.title} | 关键补给已齐，按 F 提交`;
      }
      const remain = this.objectiveNeed - this.objectiveCollected;
      return `F 提交物资：${nearbySubmit.title} | 还需 ${remain} 份关键补给`;
    }

    const nearbyLoot = this.getNearbyLoot();
    if (nearbyLoot) {
      return `F 搜索：${nearbyLoot.title} | ${nearbyLoot.prompt ?? '检查补给'}${nearbyLoot.hint ? ` | ${nearbyLoot.hint}` : ''}`;
    }

    if (this.pressure >= 78) {
      return '警报：外圈敌军正在向内收缩。';
    }

    if (this.objectiveCollected >= this.objectiveNeed) {
      return '关键补给已齐，返回主城提交处完成行动。';
    }

    return '优先补给：军粮、药材、器械部件。';
  }

  private handleInteraction(): void {
    if (this.isDialogueOpen()) return;
    if (!Phaser.Input.Keyboard.JustDown(this.keys.F) || this.time.now - this.lastInteractAt < 180) return;
    this.lastInteractAt = this.time.now;

    const target = this.activeInteractionTarget;
    if (!target) {
      if (this.campfireAwaitConfirm) {
        this.setCampfireConfirmVisible(false);
      }
      this.hudHint.setText('附近没有可交互友军、篝火、提交处或补给点。');
      return;
    }

    if (target.type === 'npc') {
      if (this.campfireAwaitConfirm) {
        this.setCampfireConfirmVisible(false);
      }
      const nearestNpc = target.ref as NpcUnit;
      this.activeDialogueNpc = nearestNpc;
      const history = this.getNpcMemory(nearestNpc.name);
      this.dialogueHistory = history;
      this.dialogueOverlay?.show(`${nearestNpc.name} | ${nearestNpc.role}`);
      if (history.length === 0) {
        history.push({ speaker: nearestNpc.name, content: nearestNpc.line });
      }
      this.renderDialogueHistory(history);
      this.dialogueOverlay?.append({
        speaker: '系统',
        content: this.aiAssistantEnabled
          ? '角色智能助手已启用：回复会结合当前战场态势。'
          : '本局角色智能助手已关闭，可在任务准备中开启。',
        tone: 'system',
      });
      this.hudHint.setText(`战术频道已连接：${nearestNpc.name}`);
      return;
    }

    if (target.type === 'campfire') {
      if (!this.campfireAwaitConfirm) {
        this.setCampfireConfirmVisible(true);
        this.hudHint.setText(`篝火确认：再次按 F 消耗 ${CAMPFIRE_CRAFT_COST} 片赤甲肉合成熟食。`);
        return;
      }
      this.tryCraftCampfireMeal();
      this.setCampfireConfirmVisible(false);
      return;
    }

    if (target.type === 'submit') {
      if (this.campfireAwaitConfirm) {
        this.setCampfireConfirmVisible(false);
      }
      this.trySubmitCriticalSupplies();
      return;
    }

    if (this.campfireAwaitConfirm) {
      this.setCampfireConfirmVisible(false);
    }
    const nearest = target.ref as LootContainer;
    this.activeLoot = nearest;
    nearest.opened = true;
    this.lootPanelOpen = true;
    this.refreshLootPanel();
  }
  private getNpcTacticalHint(): string {
    if (this.objectiveCollected < this.objectiveNeed) {
      const remain = this.objectiveNeed - this.objectiveCollected;
      if (this.pressure >= 70) {
        return `当前威胁极高。先脱离接触，再回收剩余 ${remain} 份关键补给。`;
      }
      return `补给进度 ${this.objectiveCollected}/${this.objectiveNeed}。优先军粮、药材与器械部件。`;
    }
    return '关键补给已达标，返回主城提交处完成任务。';
  }

  private getNoviceGuideHint(): string | null {
    const elapsedSec = (this.time.now - this.missionStartAt) / 1000;
    if (elapsedSec > 90) return null;
    if (elapsedSec <= 20) {
      return '新手提示：先与花木兰 / 铠 / 百里玄策交谈（F），再确定路线。';
    }
    if (elapsedSec <= 45) {
      return '新手提示：先拿最近的军粮和药材，尽快完成首批关键补给。';
    }
    if (elapsedSec <= 70) {
      return '新手提示：用 Q 扫描可显形草丛敌人，用 E 架枪优先处理高威胁目标。';
    }
    return '新手提示：敌人贴脸时，按空格后撤反击。';
  }

  private showNpcDialog(content: string): void {
    this.npcDialog.setText(content).setVisible(true);
    this.npcDialogHideEvent?.remove(false);
    this.npcDialogHideEvent = this.time.delayedCall(4200, () => {
      this.npcDialog.setVisible(false);
    });
  }

  private showBannerMessage(message: string, durationMs = 1500): void {
    if (this.resultShown) return;
    this.bannerHideEvent?.remove(false);
    this.banner.setText(message).setVisible(true);
    this.bannerHideEvent = this.time.delayedCall(durationMs, () => {
      if (!this.resultShown) this.banner.setVisible(false);
    });
  }

  private showPickupToast(item: ItemStack, sourceTitle: string): void {
    const color = getSupplyColor(item.kind, item.critical);
    const pickupText = this.isAmmoItem(item)
      ? `获得${item.label} +${item.count}\n${sourceTitle}`
      : `拾取${item.label} x${item.count}\n${sourceTitle}`;
    const toast = this.add.text(1010, 164, pickupText, {
      fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
      fontSize: item.critical ? '20px' : '18px',
      color,
      align: 'right',
      backgroundColor: item.critical ? '#281c12dd' : '#10181bdd',
      padding: { left: 12, right: 12, top: 8, bottom: 8 },
    }).setDepth(UI_DEPTH_BASE + 80).setScrollFactor(0).setOrigin(1, 0);

    this.tweens.add({
      targets: toast,
      y: toast.y - 24,
      alpha: 0,
      duration: item.critical ? 1250 : 980,
      ease: 'sine.out',
      onComplete: () => toast.destroy(),
    });

    if (item.critical) {
      this.showBannerMessage(`关键补给入手：${item.label}`, 1600);
    }
  }

  private getNpcMemory(npcName: string): Array<{ speaker: string; content: string }> {
    const existing = this.npcDialogueMemory.get(npcName);
    if (existing) return existing;

    const created: Array<{ speaker: string; content: string }> = [];
    this.npcDialogueMemory.set(npcName, created);
    return created;
  }

  private trimNpcMemory(npcName: string): void {
    const memory = this.getNpcMemory(npcName);
    if (memory.length > 24) {
      memory.splice(0, memory.length - 24);
    }
  }

  private buildPersistentMemory(npcName: string): string {
    const memory = this.getNpcMemory(npcName);
    if (memory.length === 0) {
      return '你在长安外围执行护送与补给回收任务。记住队友分工、当前压力和最近对话，保持语境连续。';
    }

    return memory
      .slice(-8)
      .map((entry) => `${entry.speaker}: ${entry.content}`)
      .join('\n');
  }

  private renderDialogueHistory(history: Array<{ speaker: string; content: string }>): void {
    this.dialogueOverlay?.clear();
    history.forEach((entry) => {
      this.dialogueOverlay?.append({
        speaker: entry.speaker,
        content: entry.content,
        tone: entry.speaker === '我' ? 'player' : 'ally',
      });
    });
  }

  private buildOfflineNpcReply(npc: NpcUnit): string {
    if (npc.name === '\u82b1\u6728\u5170') {
      return `先稳住补给线。${this.getNpcTacticalHint()}`;
    }
    if (npc.name === '\u94e0') {
      return `别被包夹。${this.getNpcTacticalHint()}`;
    }
    return `我在盯外线动向。${this.getNpcTacticalHint()}`;
  }

  private async handleDialogueSubmit(message: string): Promise<void> {
    return this.handleDialogueSubmitStream(message);
  }

  private async handleDialogueSubmitStream(message: string): Promise<void> {
    if (!this.activeDialogueNpc || !this.dialogueOverlay) return;

    const npcName = this.activeDialogueNpc.name;
    const playerLabel = '我';
    const history = this.getNpcMemory(npcName);

    this.dialogueOverlay.append({ speaker: playerLabel, content: message, tone: 'player' });
    history.push({ speaker: playerLabel, content: message });
    this.trimNpcMemory(npcName);
    this.dialogueHistory = history;

    if (!this.aiAssistantEnabled) {
      this.dialogueOverlay.append({
        speaker: '系统',
        content: '本局未启用角色智能助手。可在任务准备中开启，以获得队友智能回复。',
        tone: 'system',
      });
      this.dialogueOverlay.setBusy(false, '智能助手未启用');
      return;
    }

    this.dialogueOverlay.setBusy(true, '队友正在整理战术回复...');

    const streamingId = this.dialogueOverlay.beginStreaming({
      speaker: npcName,
      tone: 'ally',
    });

    try {
      const reply = await requestNpcDialogue(
        {
          npcName: this.activeDialogueNpc.name as '\u82b1\u6728\u5170' | '\u94e0' | '\u767e\u91cc\u7384\u7b56',
          persona: this.activeDialogueNpc.persona,
          tacticalHint: this.getNpcTacticalHint(),
          playerMessage: message,
          pressure: this.pressure,
          objectiveCollected: this.objectiveCollected,
          objectiveNeed: this.objectiveNeed,
          history,
          memory: this.buildPersistentMemory(npcName),
        },
        {
          onChunk: (partial) => {
            this.dialogueOverlay?.updateStreaming(streamingId, partial);
          },
        },
      );

      this.dialogueOverlay.finishStreaming(streamingId, reply);
      history.push({ speaker: npcName, content: reply });
      this.trimNpcMemory(npcName);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '请求失败';
      this.dialogueOverlay.finishStreaming(streamingId, '');
      this.dialogueOverlay.append({
        speaker: '系统',
        content: `角色智能助手暂时不可用：${errorMessage}` ,
        tone: 'system',
      });
    } finally {
      this.dialogueOverlay.setBusy(false, '智能助手已连接');
    }
  }

  private updateUi(): void {
    this.hudTop.setText(
      `生命 ${this.hp}   体力 ${Math.floor(this.stamina)}\n` +
      `敌军 ${this.enemies.length}   背包 ${this.itemCount()}/${this.inventoryCap}   关键 ${this.objectiveCollected}/${this.objectiveNeed}\n` +
      `模式 ${getModeLabel(this.missionConfig.mode)}   智能助手 ${this.aiAssistantEnabled ? '开启' : '关闭'}   目标 军粮 / 药材 / 器械部件`,
    );

    this.hudRisk.setText(this.getContextPrompt());
    const guideHint = this.getNoviceGuideHint();

    if (this.lootPanelOpen && this.activeLoot) {
      this.hudHint.setText('补给面板已打开。点击物品可在背包与容器之间移动，关键物资会计入目标。');
    } else if (this.reloadFinishAt > this.time.now) {
      this.hudHint.setText('正在换弹，暂时无法射击。');
    } else if (this.objectiveCollected < this.objectiveNeed) {
      this.hudHint.setText(
        `${guideHint ? `${guideHint}\n` : ''}` +
        '路线建议：先拿最近的军粮和药材，再转向外圈器械补给点。\n' +
        '操作：WASD 移动  Shift 冲刺  鼠标左键 射击  F 交互  R 换弹  5 恢复品（熟食/草药包/绷带）  Tab 背包  H 切换界面',
      );
    } else {
      this.hudHint.setText('关键补给已齐，返回主城物资提交处（F）完成行动。');
    }

    const cdQ = Math.max(0, Math.ceil((this.skillScanReadyAt - this.time.now) / 1000));
    const cdE = Math.max(0, Math.ceil((this.skillSnipeReadyAt - this.time.now) / 1000));
    const cdSpace = Math.max(0, Math.ceil((this.skillDashReadyAt - this.time.now) / 1000));
    const stateLabelMap: Record<PlayerState, string> = {
      idle: '待命',
      walk: '移动',
      aim: '瞄准',
      fire: '射击',
      hurt: '受击',
    };
    const buff = this.skillSnipeActiveUntil > this.time.now ? '狙击：架枪中' : '狙击：就绪';
    const stateLabel = stateLabelMap[this.playerVisualState];
    this.skillBoard.setText(
      `状态 ${stateLabel}   技能 ${buff}\n` +
      `冷却 Q ${cdQ}s | E ${cdE}s | Space ${cdSpace}s`,
    );

    this.syncHudVisibility();
  }
  private updateHotbar(): void {
    this.hotbarSlots.forEach((slotUi, idx) => {
      const weaponId = this.weaponSlots[idx];
      const weapon = WEAPON_CONFIG[weaponId];
      const selected = true;
      slotUi.box.setFillStyle(selected ? 0x2a4f56 : 0x141f23, selected ? 1 : 0.92);
      slotUi.box.setStrokeStyle(2, selected ? 0x7bc6b0 : 0x3c565f);
      slotUi.label.setText(`主武器 ${weapon.id === 'sniper_rifle' ? '狙击步枪' : weapon.id}`);
      const mag = this.weaponMags[weapon.id];
      const reserve = weapon.ammoType ? this.reserveAmmo[weapon.ammoType] : 0;
      slotUi.ammo.setText(`${mag}/${reserve}`);
    });
  }

  private updateCrosshair(): void {
    const p = this.input.activePointer;
    this.crosshair.clear();
    const charged = this.skillSnipeActiveUntil > this.time.now;
    const pulse = 0.74 + Math.sin(this.time.now * 0.012) * 0.16;
    this.crosshair.lineStyle(2, charged ? 0xffd58b : 0xe9efe5, 0.95);
    this.crosshair.strokeCircle(p.x, p.y, 11);
    this.crosshair.lineBetween(p.x - 17, p.y, p.x - 6, p.y);
    this.crosshair.lineBetween(p.x + 6, p.y, p.x + 17, p.y);
    this.crosshair.lineBetween(p.x, p.y - 17, p.x, p.y - 6);
    this.crosshair.lineBetween(p.x, p.y + 6, p.x, p.y + 17);
    const camera = this.cameras.main;
    const aimDir = this.resolveAimDirection(p);
    const muzzleOrigin = this.getMuzzleWorldPosition(aimDir);
    const px = camera.x + (muzzleOrigin.x - camera.worldView.x) * camera.zoom;
    const py = camera.y + (muzzleOrigin.y - camera.worldView.y) * camera.zoom;
    if (charged) {
      this.crosshair.lineStyle(7, 0xff5a5a, 0.08 + pulse * 0.06);
      this.crosshair.lineBetween(px, py, p.x, p.y);
      this.crosshair.lineStyle(1.8, 0xff5252, 0.78 + pulse * 0.18);
      this.crosshair.lineBetween(px, py, p.x, p.y);
      this.crosshair.fillStyle(0xff8c8c, 0.72 + pulse * 0.18);
      this.crosshair.fillCircle(px, py, 2.8);
      this.crosshair.lineStyle(2, 0xff8f8f, 0.3 + pulse * 0.18);
      this.crosshair.strokeCircle(p.x, p.y, 18 + pulse * 4);
      this.crosshair.fillStyle(0xff6a6a, 0.12 + pulse * 0.07);
      this.crosshair.fillCircle(p.x, p.y, 8 + pulse * 3);
      this.crosshair.fillStyle(0xffcaca, 0.86);
      this.crosshair.fillCircle(p.x, p.y, 2.2);
    }
    const scanActive = this.scoutEyes.length > 0;
    if (scanActive && !charged) {
      this.crosshair.lineStyle(1.4, 0x8fd3bf, 0.58);
      this.crosshair.strokeCircle(p.x, p.y, 14 + pulse * 2);
    }
  }

  private updatePseudo3DDepth(): void {
    this.player.setDepth(200 + this.player.y);
    this.playerShadow.setDepth(180 + this.player.y);

    this.enemies.forEach((enemy) => {
      enemy.sprite.setDepth(200 + enemy.sprite.y);
      enemy.shadow.setDepth(180 + enemy.sprite.y);
    });

    this.lootContainers.forEach((box) => {
      box.sprite.setDepth(170 + box.sprite.y);
      box.shadow.setDepth(160 + box.shadow.y);
    });

    this.npcs.forEach((npc) => {
      npc.sprite.setDepth(210 + npc.sprite.y);
      npc.shadow.setDepth(190 + npc.shadow.y);
      npc.label.setDepth(220 + npc.sprite.y);
    });

    if (this.campfireStation) {
      this.campfireStation.sprite.setDepth(205 + this.campfireStation.sprite.y);
      this.campfireStation.shadow.setDepth(185 + this.campfireStation.shadow.y);
    }
    if (this.supplySubmitStation) {
      this.supplySubmitStation.sprite.setDepth(205 + this.supplySubmitStation.sprite.y);
      this.supplySubmitStation.shadow.setDepth(185 + this.supplySubmitStation.shadow.y);
    }
  }

  private refreshLootPanel(): void {
    const show = this.lootPanelOpen;
    this.lootPanelBg.setVisible(show);
    this.lootTitle.setVisible(show);
    this.invHeader.setVisible(show);
    this.boxHeader.setVisible(show);

    this.invList.forEach((t) => t.destroy());
    this.boxList.forEach((t) => t.destroy());
    this.invList = [];
    this.boxList = [];
    if (!show) return;
    this.lootTitle.setText(this.activeLoot ? `战利品 | ${this.activeLoot.title}` : '战利品');
    this.invHeader.setText(
      `背包 | ${this.itemCount()}/${this.inventoryCap} 格 | 物资 ${this.inventoryUnitCount()} | 狙击弹 ${this.reserveAmmo.sniper}`,
    );
    this.boxHeader.setText(
      this.activeLoot
        ? `${getSupplyThemeText(this.activeLoot.theme as any)} | ${this.activeLoot.prompt ?? '待确认'}`
        : '当前无目标',
    );

    this.inventory.forEach((item, idx) => {
      const text = this.add.text(180, 210 + idx * 34, `${idx + 1}. ${this.describeItemStack(item, 'inventory')}`, {
        fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
        fontSize: '16px',
        color: item.accent ?? getSupplyColor(item.kind, item.critical),
      }).setDepth(UI_DEPTH_BASE + 62).setScrollFactor(0).setInteractive({ useHandCursor: true });
      text.on('pointerdown', () => this.moveInventoryToBox(idx));
      this.invList.push(text);
    });

    const boxItems = this.activeLoot?.items ?? [];
    boxItems.forEach((item, idx) => {
      const text = this.add.text(720, 210 + idx * 34, `${idx + 1}. ${this.describeItemStack(item, 'box')}`, {
        fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
        fontSize: '16px',
        color: item.accent ?? getSupplyColor(item.kind, item.critical),
      }).setDepth(UI_DEPTH_BASE + 62).setScrollFactor(0).setInteractive({ useHandCursor: true });
      text.on('pointerdown', () => this.moveBoxToInventory(idx));
      this.boxList.push(text);
    });

    if (boxItems.length === 0) {
      this.boxList.push(
        this.add.text(720, 210, '该容器已清空', {
          fontFamily: 'Noto Sans SC, PingFang SC, sans-serif',
          fontSize: '15px',
          color: '#8ea39a',
        }).setDepth(UI_DEPTH_BASE + 62).setScrollFactor(0),
      );
    }
  }

  private moveInventoryToBox(index: number): void {
    if (!this.activeLoot) return;
    const item = this.inventory[index];
    if (!item) return;
    this.inventory.splice(index, 1);
    this.pushItem(this.activeLoot.items, item);
    this.syncObjectiveProgress();
    this.refreshLootPanel();
  }

  private moveBoxToInventory(index: number): void {
    if (!this.activeLoot) return;
    const item = this.activeLoot.items[index];
    if (!item) return;
    if (!this.canStoreItem(item)) {
      this.hudHint.setText(`背包已满：${item.label} 无法放入`);
      return;
    }
    this.activeLoot.items.splice(index, 1);
    if (this.isAmmoItem(item)) {
      this.applyAmmoPickup(item);
    } else {
      this.pushItem(this.inventory, item);
    }
    this.syncObjectiveProgress();
    this.showPickupToast(item, this.activeLoot.title);
    this.refreshLootPanel();
  }

  private pushItem(container: ItemStack[], item: ItemStack): void {
    const found = container.find((it) => it.id === item.id);
    if (found) found.count += item.count;
    else container.push({ ...item });
  }

  private applyAmmoPickup(item: ItemStack): void {
    if (item.id === 'sniper_ammo') this.reserveAmmo.sniper += item.count;
  }

  private syncObjectiveProgress(): void {
    const recovered = this.inventory.reduce((acc, item) => {
      if (!isCriticalSupply(item.id)) return acc;
      return acc + item.count;
    }, 0);
    this.objectiveCollected = Math.min(this.objectiveNeed, recovered);
  }

  private itemCount(): number {
    return this.inventory.length;
  }

  private inventoryUnitCount(): number {
    return this.inventory.reduce((acc, it) => acc + it.count, 0);
  }

  private isAmmoItem(item: Pick<ItemStack, 'id'>): boolean {
    return item.id === 'sniper_ammo';
  }

  private canStoreItem(item: ItemStack): boolean {
    if (this.isAmmoItem(item)) return true;
    return this.inventory.some((it) => it.id === item.id) || this.itemCount() < this.inventoryCap;
  }

  private describeItemStack(item: ItemStack, location: 'inventory' | 'box'): string {
    const badge = `【${item.tag ?? '物资'}】`;
    const critical = item.critical ? ' · 关键' : '';
    if (location === 'box' && this.isAmmoItem(item)) {
      return `${badge}${item.label} +${item.count}${critical} · 弹药`;
    }
    return `${badge}${item.label} x${item.count}${critical}`;
  }

  private currentWeapon(): WeaponConfig {
    return Object.values(WEAPON_CONFIG)[0];
  }

  private toggleHudVisibility(): void {
    this.hudCollapsed = !this.hudCollapsed;
    this.syncHudVisibility();
  }

  private syncHudVisibility(): void {
    const showDetails = !this.hudCollapsed;
    this.hudDecor.forEach((item) => item.setVisible(showDetails));
    this.hudDetailItems.forEach((item) => item.setVisible(showDetails));
    this.hotbarSlots.forEach((slot) => {
      slot.box.setVisible(showDetails);
      slot.label.setVisible(showDetails);
      slot.ammo.setVisible(showDetails);
    });

    if (this.hudToggleLabel) {
      this.hudToggleLabel.setText(showDetails ? '隐藏详细信息 [H]' : '显示详细信息 [H]');
    }

    this.hudHint.setPosition(showDetails ? 24 : 20, showDetails ? 146 : 24);
    this.hudHint.setWordWrapWidth(showDetails ? 440 : 320);
    this.hudHint.setStyle({
      backgroundColor: showDetails ? undefined : '#111c1fcc',
      padding: showDetails
        ? { left: 0, right: 0, top: 0, bottom: 0 }
        : { left: 10, right: 10, top: 8, bottom: 8 },
    });
  }




  private isInsideInnerWall(x: number, y: number): boolean {
    return x > FORTRESS_LEFT && x < FORTRESS_RIGHT && y > FORTRESS_TOP && y < FORTRESS_BOTTOM;
  }


  private isInsideGateCorridor(x: number, y: number): boolean {
    return Math.abs(x - GATE_X) < GATE_WIDTH * 0.5 && y > FORTRESS_TOP - 80 && y < FORTRESS_TOP + GATE_INNER_DEPTH;
  }


  private resolveGreatWallBarrier(_body: Phaser.Physics.Arcade.Body): void {
    // Fortress walls now use Phaser static colliders instead of soft push-back.
  }



  private spawnEnemyAtEdge(): void {
    const points = [
      { x: 2080, y: 760 }, { x: 2440, y: 860 }, { x: 2880, y: 700 },
      { x: 3240, y: 1020 }, { x: 3540, y: 1460 }, { x: 3820, y: 1780 },
      { x: 3380, y: 2120 }, { x: 2600, y: 1980 },
    ];
    for (let i = 0; i < 16; i += 1) {
      const point = points[Phaser.Math.Between(0, points.length - 1)];
      const x = point.x + Phaser.Math.Between(-80, 80);
      const y = point.y + Phaser.Math.Between(-80, 80);
      if (this.isInsideInnerWall(x, y)) continue;
      if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < 420) continue;
      this.spawnEnemy(x, y, 'grunt');
      return;
    }
    this.spawnEnemy(2880, 980, 'grunt');
  }


  private dropEnemyLoot(enemy: EnemyUnit): void {
    const x = enemy.sprite.x;
    const y = enemy.sprite.y;
    if (this.isInsideInnerWall(x, y)) return;
    const shadow = this.add.ellipse(x, y + 10, 20, 8, 0x000000, 0.22).setDepth(2);
    let themeKey = 'part_model';
    let title = '散落补给';
    let theme = 'raided';
    let prompt = '遗落补给';
    let hint = '建议快速搜刮';
    let items: ItemStack[] = [];

    if (enemy.stoneGolemType === 'crimson_statue') {
      themeKey = 'container_red';
      title = '猩红补给包';
      theme = 'grain';
      prompt = '熔蚀核心补给';
      hint = '含军粮核心补给';
      items = buildSupplyItems([
        { id: 'grain_sack', count: 1 },
        { id: 'ration_pack', count: 1 },
        { id: 'sniper_ammo', count: SNIPER_AMMO_SINGLE_PICKUP_COUNT },
      ]);
    } else if (enemy.stoneGolemType === 'azure_statue') {
      themeKey = 'container_yellow';
      title = '蔚蓝补给包';
      theme = 'ordnance';
      prompt = '寒蚀核心补给';
      hint = '含器械零件补给';
      items = buildSupplyItems([
        { id: 'ballista_part', count: 1 },
        { id: 'tool_kit', count: 1 },
        { id: 'sniper_ammo', count: SNIPER_AMMO_SINGLE_PICKUP_COUNT },
      ]);
    } else if (enemy.kind === 'boss') {
      themeKey = 'ammo_crate_model';
      title = '统领辎重箱';
      theme = 'ordnance';
      prompt = '可疑重装补给';
      hint = '可能含高价值资源';
      items = buildSupplyItems([
        { id: 'arrow_bundle', count: 1 },
        { id: 'sniper_ammo', count: SNIPER_AMMO_SINGLE_PICKUP_COUNT },
        { id: 'guard_med_crate', count: 1 },
      ]);
    } else if (enemy.kind === 'elite') {
      themeKey = 'tool_box_model';
      title = '精英物资箱';
      theme = 'survival';
      prompt = '遗落补给';
      hint = '建议快速搜刮';
      items = buildSupplyItems([
        { id: 'ration_pack', count: 1 },
        { id: 'tool_kit', count: 1 },
      ]);
    } else {
      const dropId = Phaser.Math.Between(0, 1) === 0 ? 'sniper_ammo' : 'herbal_pouch';
      items = buildSupplyItems([
        { id: 'scarlet_meat', count: 1 },
        { id: dropId, count: dropId === 'sniper_ammo' ? SNIPER_AMMO_SINGLE_PICKUP_COUNT : 1 },
      ]);
    }

    const sprite = this.add.sprite(x, y, themeKey).setDepth(6);
    if (enemy.stoneGolemType === 'crimson_statue') {
      sprite.setTint(0xffb07a);
    } else if (enemy.stoneGolemType === 'azure_statue') {
      sprite.setTint(0x9ad9ff);
    }
    const crate: LootContainer = {
      sprite,
      shadow,
      title,
      opened: false,
      theme,
      prompt,
      hint,
      items,
    };
    this.lootContainers.push(crate);
  }


  private checkWinLose(): void {
    if (this.hp <= 0) {
      this.showFailureDialog();
      return;
    }
  }

  private showFailureDialog(): void {
    if (this.resultShown) return;
    this.resultShown = true;
    this.bannerHideEvent?.remove(false);
    this.banner.setText(MISSION_FAILURE_TEXT).setVisible(true);
    this.dialogueOverlay?.hide();
    if (this.lootPanelOpen) {
      this.lootPanelOpen = false;
      this.refreshLootPanel();
    }
    this.interactionRing.setVisible(false);
    this.interactionWorldHint.setVisible(false);
    this.setCampfireConfirmVisible(false);
    this.setSettlementDialogVisible(false, false);
    this.recoveryUseUntil = 0;
    this.recoveryUseItemLabel = '';
    this.recoveryUseHealAmount = 0;
    this.recoveryProgressBar.clear();
    this.recoveryProgressBar.setVisible(false);
    this.recoveryProgressLabel.setVisible(false);
    this.reloadFinishAt = 0;
    this.reloadStartAt = 0;
    this.reloadDurationMs = 0;
    this.reloadProgressBar.clear();
    this.reloadProgressBar.setVisible(false);
    this.reloadProgressLabel.setVisible(false);
    this.setFailureDialogVisible(true);
  }

  private showResult(message: string): void {
    this.showSettlementDialog('行动完成', message, false);
  }
}

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('missing #app container');
app.innerHTML = '';

new Phaser.Game({
  type: Phaser.AUTO,
  width: VIEW_WIDTH,
  height: VIEW_HEIGHT,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  parent: 'app',
  backgroundColor: '#0d1418',
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: false,
  },
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scene: [MainMenuScene, TrainingRoomScene, CharacterSelectScene, BriefingScene, MissionScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});
