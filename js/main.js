// Bootstrap: builds the Game and starts it. What the Game does lives in js/game/ (one file for each topic, mixed in below).
import './errors.js';   // platform: first, so the "Something went wrong" sheet is listening while everything else starts
import * as THREE from 'three';
import { createWorld, skyLight } from './world.js';
import { setAnisotropy } from './textures.js';
import { createRenderer } from './engine/renderer.js';
import { AutoQuality } from './engine/quality.js';
import { FramePace } from './engine/pace.js';
import { FrameStats, DebugPanel, debugWanted } from './engine/perf.js';
import { Input } from './input.js';
import { rayToGround } from './ui-logic.js';
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
import { Ships } from './ship.js';
import { YardLife } from './yardlife.js';
import { Site, SiteSign } from './site.js';
import { Builders } from './builders.js';
import { ZoomControl } from './zoom.js';
import { View } from './view.js';
import { RateMeter } from './sim/offline.js';
import { initPwa } from './pwa.js';
import { initNative } from './native.js';
import { updater } from './update.js';            // the Android app's own updater; null in a browser
import { Account } from './account.js';
import { CLOUD } from './config.js';
import { Credits } from './credits.js';           // credits: the server's answer about this player, kept in memory only
import { bindStore } from './credits-ui.js';
import { bindRanking } from './ranking-ui.js';
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
import { OverviewMethods } from './game/overview.js';
import { StoreMethods } from './game/store.js';
import { LooksMethods } from './game/looks.js';
import { paintEmblem } from './gfx/emblem.js';

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

    // Every yard outside Lumber Town is built-up land the forest keeps away from; the city's edge goes around those of
    // Industrial City and the Metropolis (edgeYards, js/sim/site.js). The coast row lies along the Metropolis's south
    // side, so the edge has no street there, and the sea begins behind the row. The building site's plot and the park's are kept
    // free of trees and of the city's buildings.
    const coast = AREAS.filter(a => a.location === 'region').map(a => a.bounds);
    this.seaZ = coast.length ? Math.max(...coast.map(r => r.maxZ)) : null;
    const { scene, camera, updateCamera, sun, hemi, setDetail } = createWorld(AREAS.map(a => ({ ...a.bounds, city: a.location !== 'town' })), [SITE.plot, SITE.park], { seaZ: this.seaZ, south: !coast.length });
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
    this.parkOpen = false; this.parkLawn = false; this.parkWarm = false; this.parkAct = null; this.parkSmoke = 0;   // the Workers' Park: whether it can be walked into and its lawn is laid, whether its crowd's shaders are made, and the picture of an activity (never saved)
    // Credits (js/credits.js): owned only once the server says so in this visit. Built before the yards, which ask it for their fence.
    this.credits = new Credits(account, { offered: !!CLOUD.url });
    this.fenceKind = () => this.credits.look('fence');
    this.quay = null;   // the Port's quay (js/stations.js, Quay) once the Port is built: the ships lie at it
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
    this.pet = new Pet(scene);   // the Yard Dog or a pet of More pets, when the server says it is owned
    this.paintEmblem = paintEmblem;   // the company's emblem on its one picture (js/gfx/emblem.js), for js/game/looks.js
    this.saleFx = ''; this.burstAt = 0; this.shopBurstAt = new WeakMap();   // the Sale effect that is chosen ('' for the game's own sparks), and when the player's last good, and the workers' last at each counter, was sold
    this.playerArea = this.areas[0];
    this.bubble = this.labels.add('bubble', '', () => this.player.headPos, { wide: true });   // far out, it is what shows where the player stands
    this.guide = new Guide(scene);
    this.pulse = new Pulse(scene);
    this.tutorial = new Tutorial(this);

    this.settings = new Settings();
    this.sfx = new Sfx(this.settings);
    this.particles = new Particles(scene);
    this.trucks = new Trucks(this);
    this.ships = new Ships(this);   // the Port's ships, where the rules say they are (js/ship.js)
    // the yard itself (list C): what is only there to be looked at, the player's own zoom, and what the camera can see
    this.life = new YardLife(this, setDetail);
    this.zoom = new ZoomControl(this.canvas, this.input);
    this.view = new View(camera);
    this.lessMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.meter = new RateMeter(this.econ.workerRate);
    this.carried = new RateMeter(1);   // how much of the credits store's timed price boosts the income meter has taken in; it starts at 1 because the saved rate is the rate without them
    this.calmRate = { rate: this.econ.workerRate, rest: 0 };   // the rate without boosts, for saves and time skips (js/sim/store.js, calmStep); the saved rate is one. Not `calm`: that is the less-motion setting (js/game/camera.js)
    this.tweens = [];
    this.stepTimer = 0;

    this.camFocus = new THREE.Vector3();
    this.camZoom = 1; this.stillFor = 0; this.punch = 0;   // the camera moves with the player (see frame)
    // how fast this device draws (js/engine/perf.js), and the automatic graphics level that follows it (js/engine/quality.js)
    this.stats = new FrameStats();
    this.autoQuality = new AutoQuality({ start: 'high' });
    // how often it draws (js/engine/pace.js): every refresh while somebody plays, fewer after a minute with no touch, and with the Battery saver
    this.pace = new FramePace({ saver: this.settings.batterySaver });
    this.pace.touch(performance.now());
    this.settings.onChange(() => { this.pace.saver = this.settings.batterySaver; });
    for (const type of ['pointerdown', 'pointermove', 'keydown', 'wheel']) addEventListener(type, () => this.pace.touch(performance.now()), { capture: true, passive: true });
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
      onRestore: save => this.restore(save),   // a backup file opened from the settings: as from the Headquarters' Records tab
      onOpen: () => { this.settingsOpen = true; this.sfx.click(); },
      onClose: () => { this.settingsOpen = false; },
      onToggle: name => { this.sfx.unlock(); this.sfx.click(); this.settings.buzz(15); if (name === 'graphics') this.applyGraphics(); },
    });
    this.hud.onSkipTutorial = () => this.tutorial.finish(true);
    this.hud.onLogPick = tab => { if (this.company.founded) this.hq.open(tab); };   // a line of the log about the company opens its tab
    this.hud.onMotivation = () => this.openPark();   // the Motivation chip opens the Workers' Park card
    // and so does a tap on the park in the world: where the tap's ray from the camera meets the ground (js/game/site.js, tapPark)
    const ray = new THREE.Vector3();
    this.input.onTap = (x, y) => {
      const r = this.canvas.getBoundingClientRect(), cam = this.camera;
      ray.set((x - r.left) / r.width * 2 - 1, -(y - r.top) / r.height * 2 + 1, 0.5).unproject(cam).sub(cam.position);
      this.tapPark(rayToGround(cam.position, ray));
    };
    this.hqOpen = false;
    this.hq = new Headquarters(this);
    this.ui = new YardUi(this, new Pulse(scene));   // yard interface: needs the HUD, the settings, the sound and the Headquarters above
    this.store = bindStore(this);                      // the credit balance in the top bar, and the store behind it
    this.credits.onChange(() => this.applyLooks());
    this.bindStoreRules();                             // the credits store's rules: what is owned folds into the company and the yards (js/game/store.js)
    this.ranking = bindRanking(this);                  // the trophy button with the company's place, and the invitation to join (js/ranking-ui.js)
    this.watch = new YardWatch(); this.hq.showName();   // more to do: what the Advisor reads, and the company's name in the header
    this.hud.setCash(this.econ.cash, true);

    this.clock = new FrameClock();
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('visibilitychange', () => { if (document.hidden) this.save(); else this.pace.touch(performance.now()); this.autoQuality.rest(); });   // coming back to the game is a touch
    this.awayAtLoad();   // time away: paid now, or once the store has answered (js/game/saving.js); before the first save overwrites the last-seen time
    this.renderer.setAnimationLoop(t => { if (this.input.steering) this.pace.touch(t); if (this.pace.due(t)) this.frame(); });   // a finger held on the stick sends no events, and is no rest

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
mix(Game, LoopMethods, CameraMethods, OverviewMethods, GraphicsMethods, MovementMethods, FeedbackMethods, CompanyChoresMethods, SiteMethods, ObjectiveMethods, SavingMethods, LooksMethods, StoreMethods);

// Find out who is playing before the game loads their save. Without a server this resolves at once as a guest.
// In the app: the game's files have all loaded, which is the first thing a new set fetched from the site has to prove.
// On a start with such a set waiting, the page is replaced by it here, before anything of the game begins.
await updater?.start();
loading.step(1);   // yard interface: the loading bar follows the real steps: files here, then the save, then the yard
const account = await new Account(CLOUD.url ? supabaseTransport(CLOUD) : undefined).boot();   // Supabase when one is configured, else this page's own server
loading.step(2);
const game = window.game = new Game(account);
account.onLeave = () => { game.save(); game.noSave = true; };
game.offerAccount = bindAccountUi(account, { onOpen: () => game.sfx.click() }).offer;
account.start();
game.credits.refresh();   // what this player has in credits: asked once the account is known, and again when the connection comes back
addEventListener('online', () => game.credits.refresh());
// shown again after a while (a tab in the background, a computer that slept): the server's day, prices and clock may have moved on
document.addEventListener('visibilitychange', () => { if (!document.hidden) game.credits.wake(); });
addEventListener('yard:sync', e => { if (e.detail?.ok && !game.credits.online) game.credits.refresh(); });
initPwa();
initNative(game);
