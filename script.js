import * as THREE from 'three';

/**
 * CONFIGURATION & CONSTANTS
 */
const TILE_SIZE = 10;       // Grid spacing (Distance between dot centers)
const WALL_HEIGHT = 2.5;    // Visual height of the walls (Y-axis)
const WALL_THICKNESS = 4;   // THICKNESS (Z for Horiz, X for Vert). 

const MAZE_W = 28;
const MAZE_H = 31;
const SPEED_NORMAL = 50; 
const SPEED_FRIGHT = 35;
const SPEED_GHOST_NORMAL = 45;
const SPEED_GHOST_FRIGHT = 25;

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
        // Init grid with Walls (1)
        let grid = Array(MAZE_H).fill().map(() => Array(MAZE_W).fill(1));

        // Helper to carve
        const setCell = (x, y, val) => {
            grid[y][x] = val;
            // Horizontal Symmetry
            grid[y][MAZE_W - 1 - x] = val;
        };

        // 1. Clear Ghost House (Center)
        for(let y=12; y<=16; y++) {
            for(let x=10; x<=17; x++) {
                grid[y][x] = (y===12 && (x===13||x===14)) ? 5 : (y>12 && x>10 && x<17) ? 9 : 1;
            }
        }
        // Force Tunnel
        for(let x=0; x<MAZE_W; x++) grid[13][x] = (x < 5 || x > MAZE_W-6) ? 0 : grid[13][x];

        // 2. Recursive Backtracker for paths (Half width)
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

            // Step 2 for thick walls
            const dirs = [{dx:0, dy:-2}, {dx:0, dy:2}, {dx:-2, dy:0}, {dx:2, dy:0}];

            dirs.forEach(d => {
                const nx = current.x + d.dx;
                const ny = current.y + d.dy;
                // Bounds check (Half width for symmetry)
                if(nx > 0 && nx < (MAZE_W/2) - 1 && ny > 0 && ny < MAZE_H - 1) {
                    if(!isVisited(nx, ny)) {
                        neighbors.push({x: nx, y: ny, dx: d.dx, dy: d.dy});
                    }
                }
            });

            if(neighbors.length > 0) {
                const chosen = neighbors[Math.floor(Math.random() * neighbors.length)];
                // Remove wall between
                setCell(current.x + chosen.dx/2, current.y + chosen.dy/2, 0);
                setCell(chosen.x, chosen.y, 0);
                visit(chosen.x, chosen.y);
                stack.push({x: chosen.x, y: chosen.y});
            } else {
                stack.pop();
            }
        }

        // 3. Post-Process: Remove Random Walls to reduce dead-ends & connect regions
        for(let y=2; y<MAZE_H-2; y++) {
            for(let x=2; x<(MAZE_W/2)-1; x++) {
                if(grid[y][x] === 1 && Math.random() > 0.85) {
                    // Check if removing creates a valid loop (simplified)
                    if(grid[y-1][x]!==1 && grid[y+1][x]!==1) setCell(x,y,0);
                    if(grid[y][x-1]!==1 && grid[y][x+1]!==1) setCell(x,y,0);
                }
            }
        }

        // 4. Fill Pellets
        for(let y=1; y<MAZE_H-1; y++) {
            for(let x=1; x<MAZE_W-1; x++) {
                if(grid[y][x] === 0) grid[y][x] = 2; // Pellet
            }
        }

        // 5. Power Pellets (Corners)
        [ {c:1, r:3}, {c:1, r:23}, {c:26, r:3}, {c:26, r:23} ].forEach(p => {
             if(grid[p.r][p.c] !== 1) grid[p.r][p.c] = 3;
        });

        // Ensure Spawn Points Clear
        grid[23][13] = 0; grid[23][14] = 0; // Pacman
        grid[11][13] = 9; grid[11][14] = 9; // Ghost door exit area

        // Convert Grid back to Strings for consistency with original loader
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
        this.mapStyle = 'ORIGINAL'; // 'ORIGINAL' or 'RANDOM'
        
        // Gamepad State
        this.gamepadMap = {}; // index -> playerNum (1 or 2)
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

        // Deterministic Loop Vars
        this.lastFrameTime = 0;
        this.accumulator = 0;
        this.fixedStep = 1 / 60; // 60hz Physics

        this.ui = {
            title: document.getElementById('center-message'),
            mainText: document.getElementById('main-title'),
            subText: document.getElementById('sub-message'),
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
        const frustumSize = 350; // Zoom level
        this.camera = new THREE.OrthographicCamera(
            frustumSize * aspect / -2, frustumSize * aspect / 2,
            frustumSize / 2, frustumSize / -2,
            1, 1000
        );
        
        // Isometric-ish view
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

        // Floor
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

    pollGamepads() {
        const gps = navigator.getGamepads ? navigator.getGamepads() : [];
        for (let i = 0; i < gps.length; i++) {
            const gp = gps[i];
            if (gp) {
                // Check if button pressed (A,B,X,Y usually 0,1,2,3)
                const pressed = gp.buttons.some((b, idx) => idx < 4 && b.pressed);
                
                if (pressed && !this.activeGamepads.has(gp.index)) {
                    // New controller joining
                    if (!Object.values(this.gamepadMap).includes(1)) {
                        this.gamepadMap[gp.index] = 1;
                        this.activeGamepads.add(gp.index);
                        this.showNotification(`GAMEPAD ${gp.index} JOINED AS PLAYER 1`);
                    } else if (!Object.values(this.gamepadMap).includes(2)) {
                        this.gamepadMap[gp.index] = 2;
                        this.activeGamepads.add(gp.index);
                        this.showNotification(`GAMEPAD ${gp.index} JOINED AS PLAYER 2`);
                        this.twoPlayerMode = true;
                        this.updateMenuUI();
                    }
                }
            }
        }
    }

    buildMaze() {
        // Cleanup
        this.walls.forEach(w => this.scene.remove(w));
        this.pellets.forEach(p => this.scene.remove(p.mesh));
        this.walls = [];
        this.pellets = [];
        this.grid = [];
        
        // SELECT MAP SOURCE
        let layout = MAP_LAYOUT;
        if (this.mapStyle === 'RANDOM') {
            layout = MazeGenerator.generate();
        }

        // Materials: Solid Blue with slight arcade glow
        const wallMat = new THREE.MeshLambertMaterial({ 
            color: this.mapStyle === 'ORIGINAL' ? 0x2121de : 0xde2121, 
            emissive: this.mapStyle === 'ORIGINAL' ? 0x080890 : 0x500808 
        });

        // Geometries
        // 1. Joint: Cylinder at the center of every wall tile
        const jointGeo = new THREE.CylinderGeometry(WALL_THICKNESS/2, WALL_THICKNESS/2, WALL_HEIGHT, 16);
        
        // 2. Connectors: 
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
                    // WALL GENERATION
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
            if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
            this.keys[e.key] = true;

            if(this.state === 'MENU') {
                if(e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'w' || e.key === 's') {
                    this.twoPlayerMode = !this.twoPlayerMode;
                    this.updateMenuUI();
                }
                // Map Select (Left/Right)
                if(e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'a' || e.key === 'd') {
                     this.mapStyle = (this.mapStyle === 'ORIGINAL') ? 'RANDOM' : 'ORIGINAL';
                     this.ui.subText.innerText = `MAP: ${this.mapStyle} (SPACE TO START)`;
                }
                if(e.key === ' ' || e.key === 'Enter') this.startGame();
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

    createActors() {
        this.actors.forEach(a => this.scene.remove(a.mesh));
        this.players = [];
        this.ghosts = [];
        this.actors = [];

        // P1 (Yellow)
        const p1 = new GhostMan(this, 1, 0xffff00);
        this.players.push(p1);

        // P2 (Ms GhostMan Pink)
        if (this.twoPlayerMode) {
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
        this.ui.title.style.display = 'block';
        this.ui.mainText.innerText = "GhostMan 3D";
        this.ui.subText.innerText = `MAP: ${this.mapStyle} (SPACE TO START)`;
        this.ui.subText.style.display = "block";
        document.getElementById('mode-select').style.display = "flex";
        this.level = 1;
        
        // Reset Controller Map so people can re-join
        this.gamepadMap = {};
        this.activeGamepads.clear();
        this.twoPlayerMode = false;
        this.updateMenuUI();
    }

    startGame() {
        this.audio.tryInit();
        this.ui.title.style.display = 'none';

        // Rebuild for randomness if selected
        if(this.mapStyle === 'RANDOM' || this.level === 1) this.buildMaze();

        this.createActors();
        this.resetLevel();
        this.audio.playIntro();
        
        this.players.forEach(p => {
            p.score = 0;
            p.lives = 3;
            p.updateUI();
        });

        setTimeout(() => { this.state = 'PLAYING'; }, 4000);
    }

    resetLevel() {
        this.players.forEach(p => p.resetPosition());
        this.ghosts.forEach(g => g.resetPosition());
        
        this.state = 'READY';
        this.ui.title.style.display = 'block';
        this.ui.title.style.background = 'transparent';
        this.ui.title.style.border = 'none';
        this.ui.title.style.boxShadow = 'none';
        this.ui.mainText.innerText = "READY!";
        this.ui.subText.style.display = 'none';
        document.getElementById('mode-select').style.display = "none";

        setTimeout(() => {
            if(this.state !== 'GAMEOVER') {
                this.ui.title.style.display = 'none';
                this.ui.title.style.background = 'rgba(0,0,0,0.9)';
                this.ui.title.style.border = '4px double var(--neon-blue)';
                this.state = 'PLAYING';
            }
        }, 2000);
    }

    loop(time) {
        requestAnimationFrame(this.loop.bind(this));

        // POLL CONTROLLERS
        if(this.state === 'MENU') this.pollGamepads();
        
        // Convert to seconds
        const seconds = time * 0.001;

        if (this.lastFrameTime === 0) {
            this.lastFrameTime = seconds;
            return;
        }

        let frameTime = seconds - this.lastFrameTime;
        this.lastFrameTime = seconds;

        // Cap frame time to prevent spirals
        if (frameTime > 0.25) frameTime = 0.25;

        this.accumulator += frameTime;

        // Fixed Timestep Update
        while (this.accumulator >= this.fixedStep) {
            this.updatePhysics(this.fixedStep);
            this.accumulator -= this.fixedStep;
        }

        this.renderer.render(this.scene, this.camera);
    }

    updatePhysics(dt) {
        if (this.state === 'PLAYING') {
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

            this.players.forEach(p => { if(!p.dead) p.update(dt); });
            this.ghosts.forEach(g => g.update(dt));

            if(this.pellets.filter(p => p.active).length === 0) this.levelComplete();
            if(this.players.filter(p => p.lives > 0).length === 0) this.gameOver();
        }
    }

    activatePowerPellet() {
        this.preFrightMode = (this.ghostMode === 'FRIGHTENED') ? this.preFrightMode : this.ghostMode;
        this.ghostMode = 'FRIGHTENED';
        this.frightenedTime = 6;
        this.ghostCombo = 0;
        this.ghosts.forEach(g => {
            g.setMode('FRIGHTENED');
            // Reverse
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

    levelComplete() {
        this.state = 'READY';
        setTimeout(() => {
            this.level++;
            // Re-generate if Random Mode
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
        // Strict Bounds Check (except tunnel row 13)
        if (r < 0 || r >= MAZE_H || c < 0 || c >= MAZE_W) {
            if (r === 13) return true; // Tunnel
            return false;
        }
        
        const val = this.grid[r][c];
        
        // 1 is Wall
        if (val === 1) return false;
        
        // Ghost specific logic
        if (isGhost) {
            if (val === 5) return true; 
            if (val === 4) return true; 
            if (val === 9) return true; // Inside ghost house
        } else {
            if (val === 4 || val === 5 || val === 9) return false;
        }
        
        return true;
    }

    // Helper: Get pixel coord for a grid coord
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
 * BASE ACTOR - ROBUST MOVEMENT
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

    // Returns TRUE if we hit/crossed the center of a tile this frame
    drive(dt) {
        // 1. Calculate ideal center of current tile
        const center = this.game.getPixelForTile(this.tilePos.col, this.tilePos.row);
        
        if (this.dir.x !== 0) this.pixelPos.z = center.z;
        if (this.dir.z !== 0) this.pixelPos.x = center.x;

        // 2. Are we currently at center?
        const distToCenter = Math.sqrt(
            Math.pow(this.pixelPos.x - center.x, 2) + 
            Math.pow(this.pixelPos.z - center.z, 2)
        );

        // 3. Movement Amount
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
                // Moving TOWARDS center
                if (moveAmt >= distToCenter) {
                    // We reach center this frame
                    this.pixelPos.x = center.x;
                    this.pixelPos.z = center.z;
                    moveAmt -= distToCenter; // Remaining movement
                    reachedCenter = true;
                } else {
                    // Just move closer
                    this.pixelPos.x += this.dir.x * moveAmt;
                    this.pixelPos.z += this.dir.z * moveAmt;
                    moveAmt = 0;
                }
            } else {
                // Moving AWAY from center
                this.pixelPos.x += this.dir.x * moveAmt;
                this.pixelPos.z += this.dir.z * moveAmt;
                moveAmt = 0;
            }
        }

        // Tunnel Wrap Check
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
        this.setTile(this.id === 1 ? 13 : 14, 23);
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

    update(dt) {
        if (this.dead) return;

        // Waka Animation
        if (this.dir !== NONE) {
            const t = Date.now() * 0.02;
            this.body.scale.set(1, 1 - (Math.sin(t)+1)*0.1, 1);
        }

        // Input
        let input = NONE;
        const k = this.game.keys;
        
        // 1. KEYBOARD
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

        // 2. GAMEPAD OVERRIDE
        const gps = navigator.getGamepads ? navigator.getGamepads() : [];
        // Find if any gamepad is assigned to this Player ID
        const gpIndex = Object.keys(this.gamepadMap || this.game.gamepadMap).find(key => this.game.gamepadMap[key] === this.id);
        
        if (gpIndex !== undefined && gps[gpIndex]) {
            const gp = gps[gpIndex];
            // Axes (Stick)
            if (gp.axes[1] < -0.5) input = UP;
            else if (gp.axes[1] > 0.5) input = DOWN;
            else if (gp.axes[0] < -0.5) input = LEFT;
            else if (gp.axes[0] > 0.5) input = RIGHT;

            // D-Pad (Standard Mapping: 12=Up, 13=Down, 14=Left, 15=Right)
            if (gp.buttons[12]?.pressed) input = UP;
            if (gp.buttons[13]?.pressed) input = DOWN;
            if (gp.buttons[14]?.pressed) input = LEFT;
            if (gp.buttons[15]?.pressed) input = RIGHT;
        }

        if (input !== NONE) this.nextDir = input;

        // Movement Step
        const result = this.drive(dt);

        // LOGIC AT INTERSECTION
        if (result.reachedCenter || this.dir === NONE) {
            
            // 1. Can we turn to nextDir?
            if (this.nextDir !== NONE) {
                const nextC = this.tilePos.col + this.nextDir.x;
                const nextR = this.tilePos.row + this.nextDir.z;
                if (this.game.isWalkable(nextC, nextR)) {
                    this.dir = this.nextDir;
                    this.nextDir = NONE;
                    // Rotate Visuals
                    if(this.dir === UP) this.body.rotation.z = Math.PI;
                    if(this.dir === DOWN) this.body.rotation.z = 0;
                    if(this.dir === LEFT) this.body.rotation.z = -Math.PI/2;
                    if(this.dir === RIGHT) this.body.rotation.z = Math.PI/2;
                }
            }

            // 2. Can we continue current dir?
            const nextC = this.tilePos.col + this.dir.x;
            const nextR = this.tilePos.row + this.dir.z;
            
            if (!this.game.isWalkable(nextC, nextR)) {
                // HIT WALL: Stop EXACTLY at center
                this.dir = NONE;
                const center = this.game.getPixelForTile(this.tilePos.col, this.tilePos.row);
                this.pixelPos.x = center.x;
                this.pixelPos.z = center.z;
                this.mesh.position.set(this.pixelPos.x, 0, this.pixelPos.z);
            } else {
                // Path is clear, move into next tile with remaining time
                if (result.remainingDt > 0 && this.dir !== NONE) {
                    this.pixelPos.x += this.dir.x * this.speed * result.remainingDt;
                    this.pixelPos.z += this.dir.z * this.speed * result.remainingDt;
                    this.mesh.position.set(this.pixelPos.x, 0, this.pixelPos.z);
                }
            }
        }

        // Pellet Logic
        const pIdx = this.game.pellets.findIndex(p => p.active && p.x === this.tilePos.col && p.z === this.tilePos.row);
        if (pIdx !== -1) {
            const p = this.game.pellets[pIdx];
            p.active = false;
            p.mesh.visible = false;
            if(p.type === 'normal') {
                this.addScore(10);
                this.game.audio.playWaka();
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
            // Revive
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

            // Eyes
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

        // Collision
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

new Game();
