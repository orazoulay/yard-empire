// Bootstrap: builds the Game and starts it. What the Game does lives in js/game/ (one file for each topic, mixed in below).
import './errors.js';   // platform: first, so the "Something went wrong" sheet is listening while everything else starts
import * as THREE from 'three';
import { createWorld, skyLight } from './world.js';
import { setAnisotropy } from './textures.js';
import { createRenderer } from './engine/renderer.js';
import { AutoQuality } from './engine/quality.js';
import { FrameStats, DebugPanel, debugWanted } from './engine/perf.js';
import { Input } from './input.js';
import { Labels } from './labels.js';
import { Fx } from './fx.js';
import { Guide, Pulse } from './guide.js';
import { Character } from './characters.js';
import { Area, doorRect } from './area.js';
import { Hud } from './hud.js';
import { Tutorial } from './tutorial.js';
import { Economy } from './sim/economy.js';
import { Company } from './sim/company.js';
import { Headquarters } from './hq.js';
import { PRESTIGE } from './data/company.js';
import { SITE } from './data/builds.js';
import { AREAS, ITEMS, RECIPES, BASE_CAPACITY, allUpgrades, gateGeom } from './data/areas.js';
import { Settings } from './settings.js';
import { Sfx } from './audio.js';
import { Particles } from './particles.js';
import { Sky } from './sky.js';
import { Trucks } from './trucks.js';
import { YardLife } from './yardlife.js';
import { Site, SiteSign } from './site.js';
import { Builders } from './builders.js';
import { ZoomControl } from './zoom.js';
import { View } from './view.js';
import { RateMeter } from './sim/offline.js';
import { initPwa } from './pwa.js';
import { initNative } from './native.js';
import { Account } from './account.js';
import { CLOUD } from './config.js';
import { Credits } from './credits.js';           // credits: the server's answer about this player, kept in memory only
import { bindStore } from './credits-ui.js';
import { Pet } from './pets.js';
import { supabaseTransport } from './cloud.js';
import { bindAccountUi } from './account-ui.js';
import { blankSave, logKey } from './sim/sync.js';
// yard interface: what the labels, the bubble, the shortcuts and the comfort settings do; and the loading screen's steps
import { YardUi } from './yard-ui.js';
import { loading } from './loading.js';
import { YardWatch } from './sim/advice.js';   // more to do: the Advisor's minute of machine readings
import { mix } from './hq/kit.js';   // the same helper that gives the Headquarters its tabs
import { FrameClock, LoopMethods } from './game/loop.js';
import { CameraMethods } from './game/camera.js';
import { GraphicsMethods } from './game/graphics.js';
import { MovementMethods } from './game/movement.js';
import { FeedbackMethods } from './game/feedback.js';
import { CompanyChoresMethods, today, SOLD_KEY } from './game/company-chores.js';
import { SiteMethods } from './game/site.js';
import { ObjectiveMethods } from './game/objective.js';
import { SavingMethods } from './game/saving.js';

class Game {
  /** @param account {Account} decides which save slot this game uses: the guest's or a signed-in player's */
  constructor(account) {
    this.account = account;
    this.saveKey = account.saveKey;
    this.canvas = document.getElementById('game');
    // the renderer (js/engine/renderer.js): a phone that drops the graphics context gets the sky's reflections made again
    this.renderer = createRenderer(this.canvas, { remake: () => { this.scene.environment?.dispose(); this.scene.environment = skyLight(this.renderer); } });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    setAnisotropy(this.renderer.capabilities.getMaxAnisotropy());

    // the Metropolis is built-up land too; the building site's plot is kept free of trees and of the city's buildings
    const { scene, camera, updateCamera, sun, hemi, setDetail } = createWorld(AREAS.map(a => ({ ...a.bounds, city: a.location !== 'town' })), [SITE.plot]);
    this.scene = scene; this.camera = camera; this.updateCamera = updateCamera;
    scene.environment = skyLight(this.renderer);
    this.sun = sun;
    this.sky = new Sky({ scene, renderer: this.renderer, sun, hemi });

    this.labels = new Labels(document.getElementById('labels'), camera);
    this.hud = new Hud({ logKey: logKey(this.saveKey) });   // the log behind the bell is kept beside this player's save
    this.fx = new Fx(document.getElementById('fx'), camera, this.hud.cashEl);
    // While the Headquarters covers the top bar, money flies to the cash in its header, which is the one in sight.
    this.fx.target = () => (this.hqOpen ? document.querySelector('#hq .hq-cash') : null);
    this.input = new Input(this.canvas, document.getElementById('joystick'));

    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(this.saveKey)); } catch { saved = null; }
    this.econ = new Economy({ items: ITEMS, upgrades: allUpgrades(AREAS), baseCapacity: BASE_CAPACITY, firstArea: AREAS[0].id }, saved);
    if (Object.keys(this.econ.unlocked).length) this.econ.tutorialDone = true;
    // The company (finances, contracts, research, routes, ranks) sits beside the economy and is saved inside it.
    this.company = new Company({ econ: this.econ, areas: AREAS, items: ITEMS, recipes: RECIPES }, saved?.company);
    this.econ.company = this.company;
    this.company.seedIncome(this.econ.workerRate);
    this.company.refreshGoals(today());
    this.chores = 0;   // seconds until the next once-a-second company chores
    this.shownEvent = null;   // the event the player was last told about

    // The building site's footprints are asked for while the yards are built (their worn paths go around what stands in the way), so they exist first.
    this.siteRects = []; this.sitePart = 0; this.onSite = false; this.siteBusy = 0; this.siteGiven = -1;
    // Credits (js/credits.js): owned only once the server says so in this visit. Built before the yards, which ask it for their fence.
    this.credits = new Credits(account, { offered: !!CLOUD.url });
    this.fenceKind = () => this.credits.look('fence');
    // Areas + the doors between them
    this.areas = AREAS.map((cfg, i) => new Area(this, cfg, AREAS.slice(0, i)));
    this.doors = [];
    for (const a of this.areas) {
      const g = a.cfg.gate; if (!g) continue;
      const gg = gateGeom(a.bounds, g);
      this.doors.push({
        a: a.id, b: g.next, gateId: 'gate:' + a.id, rect: doorRect(a.bounds, g),
        pa: { x: gg.x - gg.nx * 1.2, z: gg.z - gg.nz * 1.2 }, pb: { x: gg.x + gg.nx * 1.2, z: gg.z + gg.nz * 1.2 },
      });
    }
    for (const a of this.areas) this.econ.areaOpen(a.id) ? a.buildOpen() : a.buildLocked();
    // The building site (js/data/builds.js): the plot and what has been built on it, drawn as the company has it.
    this.buildSite = new Site(scene);
    this.siteSign = new SiteSign(this.labels);
    this.builders = new Builders(scene);
    this.syncSite();

    this.player = new Character(scene, { pack: true });
    this.pet = new Pet(scene);   // the Yard Dog, when the server says it is owned
    this.playerArea = this.areas[0];
    this.bubble = this.labels.add('bubble', '', () => this.player.headPos);
    this.guide = new Guide(scene);
    this.pulse = new Pulse(scene);
    this.tutorial = new Tutorial(this);

    this.settings = new Settings();
    this.sfx = new Sfx(this.settings);
    this.particles = new Particles(scene);
    this.trucks = new Trucks(this);
    // the yard itself (list C): what is only there to be looked at, the player's own zoom, and what the camera can see
    this.life = new YardLife(this, setDetail);
    this.zoom = new ZoomControl(this.canvas, this.input);
    this.view = new View(camera);
    this.lessMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.meter = new RateMeter(this.econ.workerRate);
    this.tweens = [];
    this.stepTimer = 0;

    this.camFocus = new THREE.Vector3();
    this.camZoom = 1; this.stillFor = 0; this.punch = 0;   // the camera moves with the player (see frame)
    // how fast this device draws (js/engine/perf.js), and the automatic graphics level that follows it (js/engine/quality.js)
    this.stats = new FrameStats();
    this.autoQuality = new AutoQuality({ start: 'high' });
    this.debug = debugWanted() ? new DebugPanel(this) : null;
    this.applyGraphics();
    this.reveal = null;
    this.settingsOpen = false;
    this.offlineOpen = false;
    this.objTimer = 0;
    this.saveTimer = 0;
    this._views = null;

    this.hud.bindSettings({
      settings: this.settings,
      onReset: () => {
        this.noSave = true;
        this.hud.clearLog();   // the log tells of the progress that is being erased
        // A signed-in player gets a fresh save stamped "now", so it replaces the copy on the server too.
        if (account.user) localStorage.setItem(this.saveKey, JSON.stringify(blankSave(Date.now())));
        else localStorage.removeItem(this.saveKey);
        location.reload();
      },
      onReplayTutorial: () => this.tutorial.restart(),
      onOpen: () => { this.settingsOpen = true; this.sfx.click(); },
      onClose: () => { this.settingsOpen = false; },
      onToggle: name => { this.sfx.unlock(); this.sfx.click(); this.settings.buzz(15); if (name === 'graphics') this.applyGraphics(); },
    });
    this.hud.onSkipTutorial = () => this.tutorial.finish(true);
    this.hud.onLogPick = tab => { if (this.company.founded) this.hq.open(tab); };   // a line of the log about the company opens its tab
    this.hqOpen = false;
    this.hq = new Headquarters(this);
    this.ui = new YardUi(this, new Pulse(scene));   // yard interface: needs the HUD, the settings, the sound and the Headquarters above
    this.store = bindStore(this);                      // the credit balance in the top bar, and the store behind it
    this.credits.onChange(() => this.applyLooks());
    this.watch = new YardWatch(); this.hq.showName();   // more to do: what the Advisor reads, and the company's name in the header
    this.hud.setCash(this.econ.cash, true);

    this.clock = new FrameClock();
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('visibilitychange', () => { if (document.hidden) this.save(); this.autoQuality.rest(); });
    this.checkOffline();   // before the first save overwrites the last-seen time
    this.renderer.setAnimationLoop(() => this.frame());

    let sold = 0;
    try { sold = Number(sessionStorage.getItem(SOLD_KEY)) || 0; sessionStorage.removeItem(SOLD_KEY); } catch { /* private mode */ }
    if (sold) {
      this.hud.unlock({ icon: '⭐', title: `Company sold: +${sold} legacy stars`, desc: `Everything now sells for ${Math.round(this.company.legacy.stars * PRESTIGE.starBonus * 100)}% more. Time to build again.`, kicker: 'A new start' });
      setTimeout(() => this.feel('sold'), 900);
    }
    const ready = () => this.hud.hideLoading();
    Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise(r => setTimeout(r, 1500))]).then(ready, ready);
  }
}

// The Game is the sum of its parts: each file in js/game/ adds its methods, and `this` is the Game in all of them.
mix(Game, LoopMethods, CameraMethods, GraphicsMethods, MovementMethods, FeedbackMethods, CompanyChoresMethods, SiteMethods, ObjectiveMethods, SavingMethods);

// Find out who is playing before the game loads their save. Without a server this resolves at once as a guest.
loading.step(1);   // yard interface: the loading bar follows the real steps: files here, then the save, then the yard
const account = await new Account(CLOUD.url ? supabaseTransport(CLOUD) : undefined).boot();   // Supabase when one is configured, else this page's own server
loading.step(2);
const game = window.game = new Game(account);
account.onLeave = () => { game.save(); game.noSave = true; };
game.offerAccount = bindAccountUi(account, { onOpen: () => game.sfx.click() }).offer;
account.start();
game.credits.refresh();   // what this player has in credits: asked once the account is known, and again when the connection comes back
addEventListener('online', () => game.credits.refresh());
addEventListener('yard:sync', e => { if (e.detail?.ok && !game.credits.online) game.credits.refresh(); });
initPwa();
initNative(game);
