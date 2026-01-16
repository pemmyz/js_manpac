import * as THREE from 'three';

/**
 * CONFIGURATION & CONSTANTS
 */
const TILE_SIZE = 10;       // Grid spacing (Distance between dot centers)
const WALL_HEIGHT = 2.5;    // Visual height of the walls (Y-axis)
const WALL_THICKNESS = 4;   // THICKNESS (Z for Horiz, X for Vert). 
                            // Set smaller than TILE_SIZE for clean "bone" connections.

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
        this.lastFrameTime = 0;

        this.ui = {
            title: document.getElementById('center-message'),
            mainText: document.getElementById('main-title'),
            subText: document.getElementById('sub-message'),
            p1Score: document.getElementById('score-p1'),
            p2Score: document.getElementById('score-p2'),
            p1Lives: document.getElementById('lives-p1'),
            p2Lives: document.getElementById('lives-p2'),
            btn1p: document.getElementById('btn-1p'),
            btn2p: document.getElementById('btn-2p')
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

    buildMaze() {
        // Cleanup
        this.walls.forEach(w => this.scene.remove(w));
        this.pellets.forEach(p => this.scene.remove(p.mesh));
        this.walls = [];
        this.pellets = [];
        this.grid = [];
        
        // Materials: Solid Blue with slight arcade glow
        const wallMat = new THREE.MeshLambertMaterial({ 
            color: 0x2121de, 
            emissive: 0x080890 
        });

        // Geometries
        // 1. Joint: Cylinder at the center of every wall tile
        const jointGeo = new THREE.CylinderGeometry(WALL_THICKNESS/2, WALL_THICKNESS/2, WALL_HEIGHT, 16);
        
        // 2. Connectors: 
        // Horizontal: Long X (TILE_SIZE), Thin Z (WALL_THICKNESS)
        const hConnGeo = new THREE.BoxGeometry(TILE_SIZE, WALL_HEIGHT, WALL_THICKNESS); 
        // Vertical: Thin X (WALL_THICKNESS), Long Z (TILE_SIZE)
        const vConnGeo = new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, TILE_SIZE); 

        const pelletGeo = new THREE.SphereGeometry(1.5, 6, 6);
        const powerGeo = new THREE.SphereGeometry(3.5, 8, 8);
        const pelletMat = new THREE.MeshLambertMaterial({ color: 0xffb8ae });

        const offsetX = (MAZE_W * TILE_SIZE) / 2;
        const offsetZ = (MAZE_H * TILE_SIZE) / 2;

        for (let row = 0; row < MAP_LAYOUT.length; row++) {
            const rowArr = [];
            for (let col = 0; col < MAP_LAYOUT[row].length; col++) {
                const char = MAP_LAYOUT[row][col];
                const val = parseInt(char);
                rowArr.push(val);

                const x = col * TILE_SIZE - offsetX + (TILE_SIZE/2);
                const z = row * TILE_SIZE - offsetZ + (TILE_SIZE/2);

                if (val === 1) {
                    // WALL GENERATION
                    
                    // 1. Place the Joint (Corner/Pillar)
                    const joint = new THREE.Mesh(jointGeo, wallMat);
                    joint.position.set(x, 0, z);
                    this.scene.add(joint);
                    this.walls.push(joint);

                    // 2. Check Right Neighbor (Connect East) - Horizontal
                    if (col < MAP_LAYOUT[row].length - 1 && parseInt(MAP_LAYOUT[row][col + 1]) === 1) {
                        const conn = new THREE.Mesh(hConnGeo, wallMat);
                        conn.position.set(x + TILE_SIZE/2, 0, z); // Place halfway between
                        this.scene.add(conn);
                        this.walls.push(conn);
                    }

                    // 3. Check Bottom Neighbor (Connect South) - Vertical
                    if (row < MAP_LAYOUT.length - 1 && parseInt(MAP_LAYOUT[row + 1][col]) === 1) {
                        const conn = new THREE.Mesh(vConnGeo, wallMat);
                        conn.position.set(x, 0, z + TILE_SIZE/2); // Place halfway between
                        this.scene.add(conn);
                        this.walls.push(conn);
                    }
                } 
                else if (val === 2) {
                    // PELLET
                    const p = new THREE.Mesh(pelletGeo, pelletMat);
                    p.position.set(x, 0, z);
                    this.scene.add(p);
                    this.pellets.push({ mesh: p, type: 'normal', x: col, z: row, active: true });
                }
                else if (val === 3) {
                    // POWER
                    const p = new THREE.Mesh(powerGeo, pelletMat);
                    p.position.set(x, 0, z);
                    this.scene.add(p);
                    this.pellets.push({ mesh: p, type: 'power', x: col, z: row, active: true });
                }
                else if (val === 5) {
                    // DOOR
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
        const p1 = new PacMan(this, 1, 0xffff00);
        this.players.push(p1);

        // P2 (Ms Pac Pink)
        if (this.twoPlayerMode) {
            const p2 = new PacMan(this, 2, 0xffb8ff); 
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
        this.ui.mainText.innerText = "PAC-MAN 3D";
        this.ui.subText.innerText = "PRESS SPACE TO START";
        this.ui.subText.style.display = "block";
        document.getElementById('mode-select').style.display = "flex";
        this.level = 1;
    }

    startGame() {
        this.audio.tryInit();
        this.ui.title.style.display = 'none';
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
        const dt = Math.min((time - this.lastFrameTime) / 1000, 0.1); // Cap dt
        this.lastFrameTime = time;

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

        this.renderer.render(this.scene, this.camera);
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
            this.buildMaze();
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
            // 5 is Door. Ghosts can pass IF they are Eaten (returning) OR if they are exiting
            if (val === 5) return true; 
            // 4 is House Interior
            if (val === 4) return true; 
        } else {
            // Pacman cannot enter house or door
            if (val === 4 || val === 5) return false;
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
        // Capture safe previous tile for emergency fallback
        const oldCol = this.tilePos.col;
        const oldRow = this.tilePos.row;
        
        const center = this.game.getPixelForTile(this.tilePos.col, this.tilePos.row);
        
        // Axis Alignment: Prevent drift
        if (this.dir.x !== 0) this.pixelPos.z = center.z;
        if (this.dir.z !== 0) this.pixelPos.x = center.x;

        // PRE-CHECK: Is the tile we are moving towards a wall?
        let blockedAhead = false;
        if (this.dir !== NONE) {
            const nextC = this.tilePos.col + this.dir.x;
            const nextR = this.tilePos.row + this.dir.z;
            // !!this.type is true for Ghosts (have type), false for Player
            if (!this.game.isWalkable(nextC, nextR, !!this.type)) {
                blockedAhead = true;
            }
        }

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
            // Determine relative position to center
            const toCenterX = center.x - this.pixelPos.x;
            const toCenterZ = center.z - this.pixelPos.z;
            const dot = toCenterX * this.dir.x + toCenterZ * this.dir.z;

            if (dot > 0) {
                // Case A: Moving TOWARDS center
                if (moveAmt >= distToCenter) {
                    // We hit the center
                    this.pixelPos.x = center.x;
                    this.pixelPos.z = center.z;
                    moveAmt -= distToCenter; // Calc remaining movement
                    reachedCenter = true;

                    // If blocked ahead, stop exactly here. Do not use remaining movement.
                    if (blockedAhead) {
                        moveAmt = 0;
                    }
                } else {
                    // Just approach center
                    this.pixelPos.x += this.dir.x * moveAmt;
                    this.pixelPos.z += this.dir.z * moveAmt;
                    moveAmt = 0;
                }
            } else {
                // Case B: Moving AWAY from center (or already past it)
                if (blockedAhead) {
                    // We are not allowed to enter the wall space. Snap/Stay at center.
                    this.pixelPos.x = center.x;
                    this.pixelPos.z = center.z;
                    moveAmt = 0;
                } else {
                    // Path is clear, proceed
                    this.pixelPos.x += this.dir.x * moveAmt;
                    this.pixelPos.z += this.dir.z * moveAmt;
                    moveAmt = 0;
                }
            }
        }

        // Tunnel Wrap
        const limit = (MAZE_W * TILE_SIZE) / 2 + TILE_SIZE;
        if (this.pixelPos.x > limit) { this.pixelPos.x = -limit + 5; this.tilePos.col = 0; }
        else if (this.pixelPos.x < -limit) { this.pixelPos.x = limit - 5; this.tilePos.col = MAZE_W - 1; }

        // Update Grid Coordinates
        const offsetX = (MAZE_W * TILE_SIZE) / 2;
        const offsetZ = (MAZE_H * TILE_SIZE) / 2;
        this.tilePos.col = Math.floor((this.pixelPos.x + offsetX) / TILE_SIZE);
        this.tilePos.row = Math.floor((this.pixelPos.z + offsetZ) / TILE_SIZE);

        // FALLBACK SAFETY: If we somehow ended up inside a wall (e.g. tunnel edge case), snap back
        if (!this.game.isWalkable(this.tilePos.col, this.tilePos.row, !!this.type)) {
            this.tilePos.col = oldCol;
            this.tilePos.row = oldRow;
            const safeCenter = this.game.getPixelForTile(oldCol, oldRow);
            this.pixelPos.x = safeCenter.x;
            this.pixelPos.z = safeCenter.z;
            reachedCenter = true;
            moveAmt = 0;
        }

        this.mesh.position.set(this.pixelPos.x, 0, this.pixelPos.z);
        
        return { reachedCenter, remainingDt: moveAmt > 0 ? moveAmt / this.speed : 0 };
    }
}

/**
 * PACMAN
 */
class PacMan extends Actor {
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
        if (input !== NONE) this.nextDir = input;

        // Movement Step
        const result = this.drive(dt);

        // LOGIC AT INTERSECTION (CENTER OF TILE)
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
                
                // FIX: Hard Snap to center to prevent visual bleeding into wall
                const center = this.game.getPixelForTile(this.tilePos.col, this.tilePos.row);
                this.pixelPos.x = center.x;
                this.pixelPos.z = center.z;
                this.mesh.position.set(this.pixelPos.x, 0, this.pixelPos.z);
            } else {
                // Path is clear, if we have remaining time, move into the next tile
                if (result.remainingDt > 0 && this.dir !== NONE) {
                    this.pixelPos.x += this.dir.x * this.speed * result.remainingDt;
                    this.pixelPos.z += this.dir.z * this.speed * result.remainingDt;
                    this.mesh.position.set(this.pixelPos.x, 0, this.pixelPos.z);
                }
            }
        }

        // Pellet Logic (Snap-independent)
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
        else if(this.type === 'PINKY') this.setTile(13, 14);
        else if(this.type === 'INKY') this.setTile(11, 14);
        else if(this.type === 'CLYDE') this.setTile(15, 14);
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

            // Apply remaining movement in new dir
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
