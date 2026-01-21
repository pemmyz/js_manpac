import * as THREE from 'three';

/**
 * CONFIGURATION & CONSTANTS
 */
const TILE_SIZE = 10;
const WALL_HEIGHT = 2.5;
const WALL_THICKNESS = 4;

const MAZE_W = 28;
const MAZE_H = 31;

// Speeds
const SPEED_NORMAL = 50; 
const SPEED_FRIGHT = 35;
const SPEED_GHOST_NORMAL = 45;
const SPEED_GHOST_FRIGHT = 25;
const SPEED_DEMO_BOT = 55; // Slightly faster to make the demo look skilled

// KEY: 1 = Wall, 0/9 = Walkable, 2/3 = Pellets, 5 = Door
const MAP_LAYOUT = [
    "1111111111111111111111111111",
    "1222222222222112222222222221",
    "1211112111112112111112111121",
    "1311112111112112111112111131",
    "1211112111112112111112111121",
    "1222222222222222222222222221",
    "1211112112111111112112111121",
    "1211112112111111112112111121",
    "1222222112222112222112222221",
    "1111112111119119111112111111",
    "0000012111119119111112100000",
    "0000012119999999999112100000",
    "1111112119111551119112111111",
    "9999992999144444419992999999", // Tunnel Row
    "1111112119111111119112111111",
    "0000012119999999999112100000",
    "0000012119111111119112100000",
    "1111112119111111119112111111",
    "1222222222222112222222222221",
    "1211112111112112111112111121",
    "1321112999999999999992111231",
    "1121112112111111112112111211",
    "1222222112222112222112222221",
    "1211111111112112111111111121",
    "1211111111112112111111111121",
    "1222222222222222222222222221",
    "1111111111111111111111111111"
];

// Directions
const UP = { x: 0, z: -1 };
const DOWN = { x: 0, z: 1 };
const LEFT = { x: -1, z: 0 };
const RIGHT = { x: 1, z: 0 };
const NONE = { x: 0, z: 0 };

/**
 * PROCEDURAL MAP GENERATOR
 */
class MazeGenerator {
    static generate() {
        let grid = Array(MAZE_H).fill().map(() => Array(MAZE_W).fill(1));

        const setCell = (x, y, val) => {
            grid[y][x] = val;
            grid[y][MAZE_W - 1 - x] = val;
        };

        for(let y=12; y<=16; y++) {
            for(let x=10; x<=17; x++) {
                grid[y][x] = (y===12 && (x===13||x===14)) ? 5 : (y>12 && x>10 && x<17) ? 9 : 1;
            }
        }
        for(let x=0; x<MAZE_W; x++) grid[13][x] = (x < 5 || x > MAZE_W-6) ? 0 : grid[13][x];

        const stack = [];
        const startX = 1;
        const startY = 1;
        const visited = new Set();
        const visit = (x, y) => visited.add(`${x},${y}`);
        const isVisited = (x, y) => visited.has(`${x},${y}`);

        stack.push({x: startX, y: startY});
        visit(startX, startY);
        setCell(startX, startY, 0);

        while(stack.length > 0) {
            const current = stack[stack.length - 1];
            const neighbors = [];
            [{dx:0, dy:-2}, {dx:0, dy:2}, {dx:-2, dy:0}, {dx:2, dy:0}].forEach(d => {
                const nx = current.x + d.dx;
                const ny = current.y + d.dy;
                if(nx > 0 && nx < (MAZE_W/2) - 1 && ny > 0 && ny < MAZE_H - 1) {
                    if(!isVisited(nx, ny)) neighbors.push({x: nx, y: ny, dx: d.dx, dy: d.dy});
                }
            });

            if(neighbors.length > 0) {
                const chosen = neighbors[Math.floor(Math.random() * neighbors.length)];
                setCell(current.x + chosen.dx/2, current.y + chosen.dy/2, 0);
                setCell(chosen.x, chosen.y, 0);
                visit(chosen.x, chosen.y);
                stack.push({x: chosen.x, y: chosen.y});
            } else {
                stack.pop();
            }
        }

        for(let y=2; y<MAZE_H-2; y++) {
            for(let x=2; x<(MAZE_W/2)-1; x++) {
                if(grid[y][x] === 1 && Math.random() > 0.85) {
                    if(grid[y-1][x]!==1 && grid[y+1][x]!==1) setCell(x,y,0);
                    if(grid[y][x-1]!==1 && grid[y][x+1]!==1) setCell(x,y,0);
                }
            }
        }

        for(let y=1; y<MAZE_H-1; y++) {
            for(let x=1; x<MAZE_W-1; x++) {
                if(grid[y][x] === 0) grid[y][x] = 2;
            }
        }

        [ {c:1, r:3}, {c:1, r:23}, {c:26, r:3}, {c:26, r:23} ].forEach(p => {
             if(grid[p.r][p.c] !== 1) grid[p.r][p.c] = 3;
        });

        grid[23][13] = 0; grid[23][14] = 0;
        grid[11][13] = 9; grid[11][14] = 9;
        grid[29][1] = 0; grid[29][26] = 0;

        return grid.map(row => row.join(''));
    }
}

/**
 * AUDIO SYNTHESIZER
 */
class SoundManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.10;
        this.masterGain.connect(this.ctx.destination);
        this.enabled = false;
    }

    tryInit() {
        if(this.ctx.state === 'suspended') {
            this.ctx.resume().then(() => { this.enabled = true; });
        } else {
            this.enabled = true;
        }
    }

    playTone(freq, type, duration, time = 0) {
        if(!this.enabled) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime + time);
        
        gain.gain.setValueAtTime(1, this.ctx.currentTime + time);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + time + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(this.ctx.currentTime + time);
        osc.stop(this.ctx.currentTime + time + duration);
    }

    playIntro() {
        this.tryInit();
        [0, 0.15, 0.30, 0.45].forEach((t, i) => {
            this.playTone(300 + (i * 100), 'square', 0.1, t);
        });
        setTimeout(() => {
             this.playTone(600, 'square', 0.3, 0);
        }, 600);
    }

    playWaka() {
        this.tryInit();
        const now = this.ctx.currentTime;
        if (this.lastWaka && now - this.lastWaka < 0.15) return;
        this.playTone(150, 'triangle', 0.08);
        this.playTone(250, 'triangle', 0.08, 0.09);
        this.lastWaka = now;
    }

    playEatGhost() {
        this.playTone(600, 'sawtooth', 0.1);
        this.playTone(900, 'sawtooth', 0.2, 0.1);
    }

    playDeath() {
        for(let i=0; i<8; i++) {
            this.playTone(400 - (i*50), 'sawtooth', 0.1, i*0.1);
        }
    }
}

/**
 * GAME ENGINE
 */
class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.audio = new SoundManager();
        
        this.twoPlayerMode = false;
        this.mapStyle = 'ORIGINAL';
        this.isDemo = false; // Flag for Demo Mode
        
        this.gamepadMap = {};
        this.activeGamepads = new Set();
        
        this.walls = [];
        this.pellets = [];
        this.actors = [];
        this.ghosts = [];
        this.players = [];
        this.grid = []; 

        this.state = 'MENU';
        this.level = 1;
        this.modeTimer = 0;
        this.ghostMode = 'SCATTER';
        this.frightenedTime = 0;
        this.ghostCombo = 0;

        // Auto-Demo Logic
        this.lastInputTime = Date.now();
        this.demoCountdown = 4;
        
        this.lastFrameTime = 0;
        this.accumulator = 0;
        this.fixedStep = 1 / 60;

        this.ui = {
            title: document.getElementById('center-message'),
            mainText: document.getElementById('main-title'),
            subText: document.getElementById('sub-message'),
            demoText: document.getElementById('demo-countdown'),
            p1Score: document.getElementById('score-p1'),
            p2Score: document.getElementById('score-p2'),
            p1Lives: document.getElementById('lives-p1'),
            p2Lives: document.getElementById('lives-p2'),
            btn1p: document.getElementById('btn-1p'),
            btn2p: document.getElementById('btn-2p'),
            notify: document.getElementById('gamepad-notify')
        };

        this.initThree();
        this.buildMaze();
        this.setupInput();

        requestAnimationFrame(this.loop.bind(this));
    }

    initThree() {
        const aspect = window.innerWidth / window.innerHeight;
        const frustumSize = 350;
        this.camera = new THREE.OrthographicCamera(
            frustumSize * aspect / -2, frustumSize * aspect / 2,
            frustumSize / 2, frustumSize / -2,
            1, 1000
        );
        
        this.camera.position.set(0, 200, 150); 
        this.camera.lookAt(0, 0, 15);

        this.renderer = new THREE.WebGLRenderer({ 
            canvas: document.getElementById('game-canvas'), 
            antialias: true 
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x050505);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
        dirLight.position.set(50, 100, 50);
        this.scene.add(dirLight);

        const floorGeo = new THREE.PlaneGeometry(MAZE_W * TILE_SIZE + 20, MAZE_H * TILE_SIZE + 20);
        const floorMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -5;
        this.scene.add(floor);
    }

    showNotification(msg) {
        const div = document.createElement('div');
        div.className = 'gp-toast';
        div.innerText = msg;
        this.ui.notify.appendChild(div);
        setTimeout(() => div.remove(), 3000);
    }

    // Called on any user interaction
    resetIdleTimer() {
        this.lastInputTime = Date.now();
        this.ui.demoText.classList.add('hidden');
        
        // If in Demo, Interrupt!
        if (this.state === 'DEMO') {
            this.resetGame();
        }
    }

    pollGamepads() {
        const gps = navigator.getGamepads ? navigator.getGamepads() : [];
        let anyPressed = false;

        for (let i = 0; i < gps.length; i++) {
            const gp = gps[i];
            if (gp) {
                const pressed = gp.buttons.some((b, idx) => idx < 4 && b.pressed);
                if (pressed) {
                    anyPressed = true;
                    if (!this.activeGamepads.has(gp.index)) {
                        if (!Object.values(this.gamepadMap).includes(1)) {
                            this.gamepadMap[gp.index] = 1;
                            this.activeGamepads.add(gp.index);
                            this.showNotification(`GAMEPAD ${gp.index} JOINED AS P1`);
                        } else if (!Object.values(this.gamepadMap).includes(2)) {
                            this.gamepadMap[gp.index] = 2;
                            this.activeGamepads.add(gp.index);
                            this.showNotification(`GAMEPAD ${gp.index} JOINED AS P2`);
                            this.twoPlayerMode = true;
                            this.updateMenuUI();
                        }
                    }
                    // Start Game via Gamepad
                    if (this.state === 'MENU' && pressed) {
                        this.resetIdleTimer();
                        this.startGame(false);
                    }
                }
            }
        }
        
        if (anyPressed) this.resetIdleTimer();
    }

    buildMaze() {
        this.walls.forEach(w => this.scene.remove(w));
        this.pellets.forEach(p => this.scene.remove(p.mesh));
        this.walls = [];
        this.pellets = [];
        this.grid = [];
        
        let layout = MAP_LAYOUT;
        if (this.mapStyle === 'RANDOM') {
            layout = MazeGenerator.generate();
        }

        const wallMat = new THREE.MeshLambertMaterial({ 
            color: this.mapStyle === 'ORIGINAL' ? 0x2121de : 0xde2121, 
            emissive: this.mapStyle === 'ORIGINAL' ? 0x080890 : 0x500808 
        });

        const jointGeo = new THREE.CylinderGeometry(WALL_THICKNESS/2, WALL_THICKNESS/2, WALL_HEIGHT, 16);
        const hConnGeo = new THREE.BoxGeometry(TILE_SIZE, WALL_HEIGHT, WALL_THICKNESS); 
        const vConnGeo = new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, TILE_SIZE); 

        const pelletGeo = new THREE.SphereGeometry(1.5, 6, 6);
        const powerGeo = new THREE.SphereGeometry(3.5, 8, 8);
        const pelletMat = new THREE.MeshLambertMaterial({ color: 0xffb8ae });

        const offsetX = (MAZE_W * TILE_SIZE) / 2;
        const offsetZ = (MAZE_H * TILE_SIZE) / 2;

        for (let row = 0; row < layout.length; row++) {
            const rowArr = [];
            for (let col = 0; col < layout[row].length; col++) {
                const char = layout[row][col];
                const val = parseInt(char);
                rowArr.push(val);

                const x = col * TILE_SIZE - offsetX + (TILE_SIZE/2);
                const z = row * TILE_SIZE - offsetZ + (TILE_SIZE/2);

                if (val === 1) {
                    const joint = new THREE.Mesh(jointGeo, wallMat);
                    joint.position.set(x, 0, z);
                    this.scene.add(joint);
                    this.walls.push(joint);

                    if (col < layout[row].length - 1 && parseInt(layout[row][col + 1]) === 1) {
                        const conn = new THREE.Mesh(hConnGeo, wallMat);
                        conn.position.set(x + TILE_SIZE/2, 0, z); 
                        this.scene.add(conn);
                        this.walls.push(conn);
                    }
                    if (row < layout.length - 1 && parseInt(layout[row + 1][col]) === 1) {
                        const conn = new THREE.Mesh(vConnGeo, wallMat);
                        conn.position.set(x, 0, z + TILE_SIZE/2);
                        this.scene.add(conn);
                        this.walls.push(conn);
                    }
                } 
                else if (val === 2) {
                    const p = new THREE.Mesh(pelletGeo, pelletMat);
                    p.position.set(x, 0, z);
                    this.scene.add(p);
                    this.pellets.push({ mesh: p, type: 'normal', x: col, z: row, active: true });
                }
                else if (val === 3) {
                    const p = new THREE.Mesh(powerGeo, pelletMat);
                    p.position.set(x, 0, z);
                    this.scene.add(p);
                    this.pellets.push({ mesh: p, type: 'power', x: col, z: row, active: true });
                }
                else if (val === 5) {
                    const doorGeo = new THREE.BoxGeometry(TILE_SIZE, 1, 2);
                    const doorMat = new THREE.MeshBasicMaterial({ color: 0xffb8ff, transparent: true, opacity: 0.5 });
                    const door = new THREE.Mesh(doorGeo, doorMat);
                    door.position.set(x, 0, z);
                    this.scene.add(door);
                }
            }
            this.grid.push(rowArr);
        }
    }

    setupInput() {
        this.keys = {};
        window.addEventListener('keydown', (e) => {
            this.resetIdleTimer(); // Reset idle on any key
            
            if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
            this.keys[e.key] = true;

            if(this.state === 'MENU') {
                if(e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'w' || e.key === 's') {
                    this.twoPlayerMode = !this.twoPlayerMode;
                    this.updateMenuUI();
                }
                if(e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'a' || e.key === 'd') {
                     this.mapStyle = (this.mapStyle === 'ORIGINAL') ? 'RANDOM' : 'ORIGINAL';
                     this.ui.subText.innerText = `MAP: ${this.mapStyle} (SPACE TO START)`;
                }
                if(e.key === ' ' || e.key === 'Enter') this.startGame(false);
            }
            if(this.state === 'GAMEOVER' && (e.key === ' ' || e.key === 'Enter')) {
                this.resetGame();
            }
        });
        window.addEventListener('keyup', (e) => this.keys[e.key] = false);
    }

    updateMenuUI() {
        if(this.twoPlayerMode) {
            this.ui.btn1p.classList.remove('selected');
            this.ui.btn2p.classList.add('selected');
        } else {
            this.ui.btn1p.classList.add('selected');
            this.ui.btn2p.classList.remove('selected');
        }
    }

    checkDemoTrigger() {
        if(this.state !== 'MENU') return;
        
        const idleTime = (Date.now() - this.lastInputTime) / 1000;
        const timeLeft = Math.ceil(4.0 - idleTime);

        if (timeLeft <= 3 && timeLeft > 0) {
            this.ui.demoText.classList.remove('hidden');
            this.ui.demoText.innerText = `DEMO IN ${timeLeft}`;
        } else if (timeLeft > 3) {
            this.ui.demoText.classList.add('hidden');
        }

        if (idleTime >= 4.0) {
            this.startGame(true); // Start Demo
        }
    }

    createActors() {
        this.actors.forEach(a => this.scene.remove(a.mesh));
        this.players = [];
        this.ghosts = [];
        this.actors = [];

        // P1
        const p1 = new GhostMan(this, 1, 0xffff00);
        this.players.push(p1);

        // P2 (Only in real game if selected)
        if (this.twoPlayerMode && !this.isDemo) {
            const p2 = new GhostMan(this, 2, 0xffb8ff); 
            this.players.push(p2);
        }

        const gColors = [0xff0000, 0xffb8ff, 0x00ffff, 0xffb852];
        const gTypes = ['BLINKY', 'PINKY', 'INKY', 'CLYDE'];
        
        gTypes.forEach((type, i) => {
            const g = new Ghost(this, type, gColors[i]);
            this.ghosts.push(g);
        });

        this.actors = [...this.players, ...this.ghosts];
    }

    resetGame() {
        this.state = 'MENU';
        this.isDemo = false;
        this.ui.title.style.display = 'block';
        this.ui.mainText.innerText = "GhostMan 3D";
        this.ui.subText.innerText = `MAP: ${this.mapStyle} (SPACE TO START)`;
        this.ui.subText.style.display = "block";
        this.ui.demoText.classList.add('hidden');
        document.getElementById('mode-select').style.display = "flex";
        this.level = 1;
        this.lastInputTime = Date.now();
        
        this.gamepadMap = {};
        this.activeGamepads.clear();
        this.twoPlayerMode = false;
        this.updateMenuUI();
    }

    startGame(isDemo = false) {
        this.isDemo = isDemo;
        this.state = isDemo ? 'DEMO' : 'PLAYING'; // Skip ready phase for demo usually? Or keep it.
        
        if(!isDemo) this.audio.tryInit();
        this.ui.title.style.display = 'none';

        if(this.mapStyle === 'RANDOM' || this.level === 1) this.buildMaze();

        this.createActors();
        this.resetLevel();
        
        if(!isDemo) this.audio.playIntro();
        
        this.players.forEach(p => {
            p.score = 0;
            p.lives = 3;
            p.updateUI();
            if(isDemo) p.speed = SPEED_DEMO_BOT; // Set Bot Speed
        });

        if (isDemo) {
            this.ui.mainText.innerText = "DEMO MODE";
            this.ui.subText.innerText = "PRESS ANY KEY TO START";
            this.ui.title.style.display = 'block';
            this.ui.title.style.background = 'transparent';
            this.ui.title.style.border = 'none';
            this.ui.title.style.boxShadow = 'none';
            setTimeout(() => { 
                if(this.state === 'DEMO') this.ui.title.style.display = 'none'; 
            }, 2000);
        } else {
            setTimeout(() => { this.state = 'PLAYING'; }, 4000);
        }
    }

    resetLevel() {
        this.players.forEach(p => p.resetPosition());
        this.ghosts.forEach(g => g.resetPosition());
        
        if (!this.isDemo) {
            this.state = 'READY';
            this.ui.title.style.display = 'block';
            this.ui.title.style.background = 'transparent';
            this.ui.title.style.border = 'none';
            this.ui.title.style.boxShadow = 'none';
            this.ui.mainText.innerText = "READY!";
            this.ui.subText.style.display = 'none';
        } else {
            this.state = 'DEMO';
        }
        
        document.getElementById('mode-select').style.display = "none";

        if (!this.isDemo) {
            setTimeout(() => {
                if(this.state !== 'GAMEOVER') {
                    this.ui.title.style.display = 'none';
                    this.ui.title.style.background = 'rgba(0,0,0,0.9)';
                    this.ui.title.style.border = '4px double var(--neon-blue)';
                    this.state = 'PLAYING';
                }
            }, 2000);
        }
    }

    loop(time) {
        requestAnimationFrame(this.loop.bind(this));

        if(this.state === 'MENU') {
            this.pollGamepads();
            this.checkDemoTrigger();
        } else if (this.state === 'DEMO') {
            // Also poll gamepads in Demo to allow interruption
            this.pollGamepads();
        }
        
        const seconds = time * 0.001;
        if (this.lastFrameTime === 0) {
            this.lastFrameTime = seconds;
            return;
        }

        let frameTime = seconds - this.lastFrameTime;
        this.lastFrameTime = seconds;
        if (frameTime > 0.25) frameTime = 0.25;

        this.accumulator += frameTime;

        while (this.accumulator >= this.fixedStep) {
            this.updatePhysics(this.fixedStep);
            this.accumulator -= this.fixedStep;
        }

        this.renderer.render(this.scene, this.camera);
    }

    updatePhysics(dt) {
        if (this.state === 'PLAYING' || this.state === 'DEMO') {
            if (this.frightenedTime > 0) {
                this.frightenedTime -= dt;
                if (this.frightenedTime <= 0) {
                    this.ghostMode = this.preFrightMode || 'SCATTER';
                    this.ghosts.forEach(g => g.setMode(this.ghostMode));
                }
            } else {
                this.modeTimer += dt;
                const cycle = this.modeTimer % 27;
                const newMode = cycle < 7 ? 'SCATTER' : 'CHASE';
                if (newMode !== this.ghostMode) {
                    this.ghostMode = newMode;
                    this.ghosts.forEach(g => g.setMode(newMode));
                }
            }

            // In DEMO, handle Player AI
            this.players.forEach(p => { 
                if(!p.dead) {
                    if (this.state === 'DEMO') p.updateAI();
                    p.update(dt); 
                }
            });
            this.ghosts.forEach(g => g.update(dt));

            if(this.pellets.filter(p => p.active).length === 0) this.levelComplete();
            if(this.players.filter(p => p.lives > 0).length === 0) {
                 if(this.state === 'DEMO') this.resetGame();
                 else this.gameOver();
            }
        }
    }

    activatePowerPellet() {
        this.preFrightMode = (this.ghostMode === 'FRIGHTENED') ? this.preFrightMode : this.ghostMode;
        this.ghostMode = 'FRIGHTENED';
        this.frightenedTime = 6;
        this.ghostCombo = 0;
        this.ghosts.forEach(g => {
            g.setMode('FRIGHTENED');
            if(g.mode !== 'EATEN') g.dir = { x: -g.dir.x, z: -g.dir.z };
        });
    }

    handleGhostEat(ghost, player) {
        this.ghostCombo++;
        player.addScore(200 * Math.pow(2, this.ghostCombo - 1));
        ghost.setMode('EATEN');
        this.audio.playEatGhost();
    }

    playerDied(player) {
        player.lives--;
        player.dead = true;
        player.mesh.visible = false;
        player.updateUI();
        this.audio.playDeath();

        if (this.players.every(p => p.dead || p.lives <= 0)) {
            if(this.state === 'DEMO') {
                setTimeout(() => this.resetGame(), 1000);
            } else {
                this.state = 'DYING';
                setTimeout(() => {
                    const anyLives = this.players.some(p => p.lives > 0);
                    if (anyLives) {
                        this.players.forEach(p => { if(p.lives > 0) { p.dead = false; p.mesh.visible = true; }});
                        this.resetLevel();
                    } else {
                        this.gameOver();
                    }
                }, 2000);
            }
        }
    }

    levelComplete() {
        // In Demo, just restart
        if(this.state === 'DEMO') {
             this.resetGame();
             return;
        }
        this.state = 'READY';
        setTimeout(() => {
            this.level++;
            if(this.mapStyle === 'RANDOM') this.buildMaze();
            this.resetLevel();
        }, 3000);
    }

    gameOver() {
        this.state = 'GAMEOVER';
        this.ui.title.style.display = 'block';
        this.ui.mainText.innerText = "GAME OVER";
        this.ui.subText.innerText = "PRESS SPACE TO RESTART";
        this.ui.subText.style.display = 'block';
        document.getElementById('mode-select').style.display = "none";
    }

    isWalkable(c, r, isGhost = false) {
        if (r < 0 || r >= MAZE_H || c < 0 || c >= MAZE_W) {
            if (r === 13) return true; 
            return false;
        }
        const val = this.grid[r][c];
        if (val === 1) return false;
        if (isGhost) {
            if (val === 5 || val === 4 || val === 9) return true; 
        } else {
            if (val === 4 || val === 5 || val === 9) return false;
        }
        return true;
    }

    getPixelForTile(col, row) {
        const offsetX = (MAZE_W * TILE_SIZE) / 2;
        const offsetZ = (MAZE_H * TILE_SIZE) / 2;
        return {
            x: col * TILE_SIZE - offsetX + (TILE_SIZE/2),
            z: row * TILE_SIZE - offsetZ + (TILE_SIZE/2)
        };
    }
}

/**
 * BASE ACTOR
 */
class Actor {
    constructor(game) {
        this.game = game;
        this.mesh = new THREE.Group();
        this.game.scene.add(this.mesh);
        this.tilePos = { col: 1, row: 1 };
        this.pixelPos = { x: 0, z: 0 };
        this.dir = NONE;
        this.nextDir = NONE;
        this.speed = SPEED_NORMAL;
    }

    setTile(col, row) {
        this.tilePos = { col, row };
        const center = this.game.getPixelForTile(col, row);
        this.pixelPos.x = center.x;
        this.pixelPos.z = center.z;
        this.mesh.position.set(this.pixelPos.x, 0, this.pixelPos.z);
    }

    drive(dt) {
        const center = this.game.getPixelForTile(this.tilePos.col, this.tilePos.row);
        
        if (this.dir.x !== 0) this.pixelPos.z = center.z;
        if (this.dir.z !== 0) this.pixelPos.x = center.x;

        const distToCenter = Math.sqrt(
            Math.pow(this.pixelPos.x - center.x, 2) + 
            Math.pow(this.pixelPos.z - center.z, 2)
        );

        let moveAmt = this.speed * dt;
        let reachedCenter = false;

        if (this.dir === NONE) {
            this.pixelPos.x = center.x;
            this.pixelPos.z = center.z;
        } else {
            const toCenterX = center.x - this.pixelPos.x;
            const toCenterZ = center.z - this.pixelPos.z;
            const dot = toCenterX * this.dir.x + toCenterZ * this.dir.z;

            if (dot > 0) {
                if (moveAmt >= distToCenter) {
                    this.pixelPos.x = center.x;
                    this.pixelPos.z = center.z;
                    moveAmt -= distToCenter;
                    reachedCenter = true;
                } else {
                    this.pixelPos.x += this.dir.x * moveAmt;
                    this.pixelPos.z += this.dir.z * moveAmt;
                    moveAmt = 0;
                }
            } else {
                this.pixelPos.x += this.dir.x * moveAmt;
                this.pixelPos.z += this.dir.z * moveAmt;
                moveAmt = 0;
            }
        }

        const limit = (MAZE_W * TILE_SIZE) / 2 + TILE_SIZE;
        if (this.pixelPos.x > limit) { this.pixelPos.x = -limit + 5; this.tilePos.col = 0; }
        else if (this.pixelPos.x < -limit) { this.pixelPos.x = limit - 5; this.tilePos.col = MAZE_W - 1; }

        const offsetX = (MAZE_W * TILE_SIZE) / 2;
        const offsetZ = (MAZE_H * TILE_SIZE) / 2;
        this.tilePos.col = Math.floor((this.pixelPos.x + offsetX) / TILE_SIZE);
        this.tilePos.row = Math.floor((this.pixelPos.z + offsetZ) / TILE_SIZE);

        this.mesh.position.set(this.pixelPos.x, 0, this.pixelPos.z);
        return { reachedCenter, remainingDt: moveAmt > 0 ? moveAmt / this.speed : 0 };
    }
}

/**
 * GHOSTMAN
 */
class GhostMan extends Actor {
    constructor(game, id, color) {
        super(game);
        this.id = id; 
        this.score = 0;
        this.lives = 3;
        this.dead = false;

        const geo = new THREE.SphereGeometry(3.5, 16, 16, 0, Math.PI * 2, 0.2, Math.PI - 0.4);
        const mat = new THREE.MeshLambertMaterial({ color: color });
        this.body = new THREE.Mesh(geo, mat);
        this.body.rotation.x = -Math.PI/2;
        this.mesh.add(this.body);

        if (id === 2) {
            const bowGeo = new THREE.SphereGeometry(1.5, 8, 8);
            const bowMat = new THREE.MeshLambertMaterial({ color: 0xff0000 });
            const bow = new THREE.Mesh(bowGeo, bowMat);
            bow.position.set(0, 0, -2);
            this.body.add(bow);
        }
        this.resetPosition();
    }

    resetPosition() {
        this.dir = NONE;
        this.nextDir = NONE;
        this.dead = false;
        this.mesh.visible = true;
        this.body.rotation.z = 0;
        if (this.game.mapStyle === 'RANDOM') {
            this.setTile(this.id === 1 ? 1 : 26, 29);
        } else {
            this.setTile(this.id === 1 ? 13 : 14, 23);
        }
    }

    updateUI() {
        if(this.id === 1) {
            this.game.ui.p1Score.innerText = this.score;
            this.game.ui.p1Lives.innerText = "● ".repeat(this.lives);
        } else {
            this.game.ui.p2Score.innerText = this.score;
            this.game.ui.p2Lives.innerText = "● ".repeat(this.lives);
        }
    }

    addScore(pts) {
        this.score += pts;
        this.updateUI();
        const hs = document.getElementById('high-score');
        if(this.score > (parseInt(hs.innerText)||0)) hs.innerText = this.score;
    }

    // --- AI BOT LOGIC FOR DEMO ---
    updateAI() {
        // Only think if we are at the center of a tile to make clean turns
        if (this.dir !== NONE && this.game.getPixelForTile(this.tilePos.col, this.tilePos.row).x !== this.pixelPos.x) return;
        
        // 1. Safety Check: Where are the ghosts?
        const ghosts = this.game.ghosts.filter(g => g.mode !== 'EATEN');
        const dangerous = ghosts.filter(g => g.mode !== 'FRIGHTENED');
        const huntable = ghosts.filter(g => g.mode === 'FRIGHTENED');

        const moves = [UP, DOWN, LEFT, RIGHT];
        const validMoves = moves.filter(d => this.game.isWalkable(this.tilePos.col + d.x, this.tilePos.row + d.z));

        // Filter out suicide moves (immediate collision)
        const safeMoves = validMoves.filter(d => {
            const nx = this.tilePos.col + d.x;
            const ny = this.tilePos.row + d.z;
            return !dangerous.some(g => Math.abs(g.tilePos.col - nx) + Math.abs(g.tilePos.row - ny) < 2);
        });

        const choices = safeMoves.length > 0 ? safeMoves : validMoves; // Panic if no safe moves

        if (choices.length === 0) return;

        // BFS Helper
        const findPath = (goals) => {
            const queue = [{ c: this.tilePos.col, r: this.tilePos.row, firstMove: null }];
            const visited = new Set();
            visited.add(`${this.tilePos.col},${this.tilePos.row}`);

            while(queue.length > 0) {
                const cur = queue.shift();
                
                // Check if goal
                if (goals.some(g => g.c === cur.c && g.r === cur.r)) {
                    return cur.firstMove;
                }

                for (let m of moves) {
                    const nc = cur.c + m.x;
                    const nr = cur.r + m.z;
                    if (this.game.isWalkable(nc, nr) && !visited.has(`${nc},${nr}`)) {
                        visited.add(`${nc},${nr}`);
                        queue.push({ c: nc, r: nr, firstMove: cur.firstMove || m });
                    }
                }
            }
            return null;
        };

        let targetMove = null;

        // Priority 1: Hunt Blue Ghosts
        if (huntable.length > 0) {
            const targets = huntable.map(g => ({ c: g.tilePos.col, r: g.tilePos.row }));
            targetMove = findPath(targets);
        }

        // Priority 2: Get Pellets
        if (!targetMove) {
            // Optimization: Only search for pellets within radius or fallback to random
            const pellets = this.game.pellets.filter(p => p.active);
            if(pellets.length > 0) {
                // Find nearest logic is implicitly handled by BFS layer order
                // Just map pellets to simple coord objects
                // To save perf, we might limit this, but map is small enough
                const pTargets = pellets.map(p => ({c: p.x, r: p.z}));
                targetMove = findPath(pTargets);
            }
        }

        // Execution
        if (targetMove && choices.includes(targetMove)) {
            this.nextDir = targetMove;
        } else {
            // Random valid move if no path or path blocked
            this.nextDir = choices[Math.floor(Math.random() * choices.length)];
        }
    }

    update(dt) {
        if (this.dead) return;

        // Animation
        if (this.dir !== NONE) {
            const t = Date.now() * 0.02;
            this.body.scale.set(1, 1 - (Math.sin(t)+1)*0.1, 1);
        }

        let input = NONE;
        
        // 1. If DEMO, input is handled by updateAI setting nextDir directly
        if (!this.game.isDemo) {
            const k = this.game.keys;
            if (this.id === 1) {
                if (k['ArrowUp']) input = UP;
                else if (k['ArrowDown']) input = DOWN;
                else if (k['ArrowLeft']) input = LEFT;
                else if (k['ArrowRight']) input = RIGHT;
            } else {
                if (k['w']) input = UP;
                else if (k['s']) input = DOWN;
                else if (k['a']) input = LEFT;
                else if (k['d']) input = RIGHT;
            }

            // Gamepad
            const gpIndex = Object.keys(this.game.gamepadMap).find(key => this.game.gamepadMap[key] === this.id);
            if (gpIndex !== undefined) {
                const gps = navigator.getGamepads ? navigator.getGamepads() : [];
                const gp = gps[gpIndex];
                if (gp) {
                    if (gp.axes[1] < -0.5) input = UP;
                    else if (gp.axes[1] > 0.5) input = DOWN;
                    else if (gp.axes[0] < -0.5) input = LEFT;
                    else if (gp.axes[0] > 0.5) input = RIGHT;
                    if (gp.buttons[12]?.pressed) input = UP;
                    if (gp.buttons[13]?.pressed) input = DOWN;
                    if (gp.buttons[14]?.pressed) input = LEFT;
                    if (gp.buttons[15]?.pressed) input = RIGHT;
                }
            }
            if (input !== NONE) this.nextDir = input;
        }

        const result = this.drive(dt);

        if (result.reachedCenter || this.dir === NONE) {
            // Turn?
            if (this.nextDir !== NONE) {
                const nextC = this.tilePos.col + this.nextDir.x;
                const nextR = this.tilePos.row + this.nextDir.z;
                if (this.game.isWalkable(nextC, nextR)) {
                    this.dir = this.nextDir;
                    this.nextDir = NONE;
                    if(this.dir === UP) this.body.rotation.z = Math.PI;
                    if(this.dir === DOWN) this.body.rotation.z = 0;
                    if(this.dir === LEFT) this.body.rotation.z = -Math.PI/2;
                    if(this.dir === RIGHT) this.body.rotation.z = Math.PI/2;
                }
            }

            // Continue?
            const nextC = this.tilePos.col + this.dir.x;
            const nextR = this.tilePos.row + this.dir.z;
            
            if (!this.game.isWalkable(nextC, nextR)) {
                this.dir = NONE;
                const center = this.game.getPixelForTile(this.tilePos.col, this.tilePos.row);
                this.pixelPos.x = center.x;
                this.pixelPos.z = center.z;
                this.mesh.position.set(this.pixelPos.x, 0, this.pixelPos.z);
            } else {
                if (result.remainingDt > 0 && this.dir !== NONE) {
                    this.pixelPos.x += this.dir.x * this.speed * result.remainingDt;
                    this.pixelPos.z += this.dir.z * this.speed * result.remainingDt;
                    this.mesh.position.set(this.pixelPos.x, 0, this.pixelPos.z);
                }
            }
        }

        const pIdx = this.game.pellets.findIndex(p => p.active && p.x === this.tilePos.col && p.z === this.tilePos.row);
        if (pIdx !== -1) {
            const p = this.game.pellets[pIdx];
            p.active = false;
            p.mesh.visible = false;
            if(p.type === 'normal') {
                this.addScore(10);
                if(!this.game.isDemo) this.game.audio.playWaka();
            } else {
                this.addScore(50);
                this.game.activatePowerPellet();
            }
        }
    }
}

/**
 * GHOST
 */
class Ghost extends Actor {
    constructor(game, type, color) {
        super(game);
        this.type = type;
        this.baseColor = color;
        this.mode = 'SCATTER';

        const geo = new THREE.CapsuleGeometry(3.5, 4, 4, 8);
        this.mat = new THREE.MeshLambertMaterial({ color: color });
        this.body = new THREE.Mesh(geo, this.mat);
        this.body.position.y = 2;
        this.mesh.add(this.body);

        const skirtGeo = new THREE.CylinderGeometry(3.5, 4.5, 2, 8);
        const skirt = new THREE.Mesh(skirtGeo, this.mat);
        skirt.position.y = -2;
        this.body.add(skirt);

        const eyeGeo = new THREE.SphereGeometry(1.2, 8, 8);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const pupilGeo = new THREE.SphereGeometry(0.6, 8, 8);
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x0000dd });

        this.eyes = new THREE.Group();
        const le = new THREE.Mesh(eyeGeo, eyeMat); le.position.set(-1.5, 2, 2.5);
        const re = new THREE.Mesh(eyeGeo, eyeMat); re.position.set(1.5, 2, 2.5);
        const lp = new THREE.Mesh(pupilGeo, pupilMat); lp.position.z = 1;
        const rp = new THREE.Mesh(pupilGeo, pupilMat); rp.position.z = 1;
        le.add(lp); re.add(rp);
        this.eyes.add(le); this.eyes.add(re);
        this.mesh.add(this.eyes);

        this.resetPosition();
    }

    resetPosition() {
        this.setMode('SCATTER');
        this.dir = LEFT;
        if(this.type === 'BLINKY') this.setTile(13, 11);
        else if(this.type === 'PINKY') this.setTile(13, 13);
        else if(this.type === 'INKY') this.setTile(11, 13);
        else if(this.type === 'CLYDE') this.setTile(15, 13);
    }

    setMode(m) {
        this.mode = m;
        if (m === 'FRIGHTENED') {
            this.mat.color.setHex(0x0000ff);
            this.speed = SPEED_GHOST_FRIGHT;
        } else if (m === 'EATEN') {
            this.mat.visible = false;
            this.speed = 120;
        } else {
            this.mat.visible = true;
            this.mat.color.setHex(this.baseColor);
            this.speed = SPEED_GHOST_NORMAL;
        }
    }

    getTarget() {
        if (this.mode === 'EATEN') return { col: 13, row: 11 };
        const targets = this.game.players.filter(p => !p.dead);
        if(!targets.length) return {col: this.tilePos.col, row: this.tilePos.row};
        
        let targetP = targets[0];
        if (targets.length > 1) {
            const d1 = Math.abs(this.tilePos.col - targets[0].tilePos.col) + Math.abs(this.tilePos.row - targets[0].tilePos.row);
            const d2 = Math.abs(this.tilePos.col - targets[1].tilePos.col) + Math.abs(this.tilePos.row - targets[1].tilePos.row);
            if (d2 < d1) targetP = targets[1];
        }

        const tx = targetP.tilePos.col;
        const ty = targetP.tilePos.row;

        if (this.mode === 'SCATTER') {
             if (this.type === 'BLINKY') return { col: MAZE_W-2, row: 0 };
             if (this.type === 'PINKY') return { col: 1, row: 0 };
             if (this.type === 'INKY') return { col: MAZE_W-1, row: MAZE_H-1 };
             if (this.type === 'CLYDE') return { col: 0, row: MAZE_H-1 };
        }
        return { col: tx, row: ty };
    }

    update(dt) {
        const result = this.drive(dt);

        if (result.reachedCenter) {
            if (this.mode === 'EATEN' && Math.abs(this.tilePos.col - 13) < 2 && Math.abs(this.tilePos.row - 14) < 2) {
                this.setMode('CHASE');
                this.dir = UP;
                return;
            }

            const target = this.getTarget();
            const dirs = [UP, LEFT, DOWN, RIGHT];
            
            const valid = dirs.filter(d => {
                if (this.mode !== 'FRIGHTENED' && d.x === -this.dir.x && d.z === -this.dir.z) return false;
                return this.game.isWalkable(this.tilePos.col + d.x, this.tilePos.row + d.z, true);
            });

            if (valid.length > 0) {
                if (this.mode === 'FRIGHTENED') {
                    this.dir = valid[Math.floor(Math.random() * valid.length)];
                } else {
                    let best = valid[0];
                    let minD = 999999;
                    valid.forEach(d => {
                        const dist = Math.pow((this.tilePos.col + d.x) - target.col, 2) + Math.pow((this.tilePos.row + d.z) - target.row, 2);
                        if (dist < minD) { minD = dist; best = d; }
                    });
                    this.dir = best;
                }
            } else {
                 this.dir = { x: -this.dir.x, z: -this.dir.z };
            }

            if(this.dir === UP) this.eyes.rotation.y = Math.PI;
            if(this.dir === DOWN) this.eyes.rotation.y = 0;
            if(this.dir === LEFT) this.eyes.rotation.y = -Math.PI/2;
            if(this.dir === RIGHT) this.eyes.rotation.y = Math.PI/2;

            if (result.remainingDt > 0) {
                this.pixelPos.x += this.dir.x * this.speed * result.remainingDt;
                this.pixelPos.z += this.dir.z * this.speed * result.remainingDt;
                this.mesh.position.set(this.pixelPos.x, 0, this.pixelPos.z);
            }
        }

        this.game.players.forEach(p => {
            if (p.dead) return;
            const dist = Math.abs(p.pixelPos.x - this.pixelPos.x) + Math.abs(p.pixelPos.z - this.pixelPos.z);
            if (dist < 8) {
                if (this.mode === 'FRIGHTENED') this.game.handleGhostEat(this, p);
                else if (this.mode !== 'EATEN') this.game.playerDied(p);
            }
        });
    }
}

// Start
new Game();
