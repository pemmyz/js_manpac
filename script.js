import * as THREE from 'three';

/**
 * CONFIGURATION & CONSTANTS
 */
const TILE_SIZE = 10;
const MAZE_W = 28;
const MAZE_H = 31;
const SPEED_NORMAL = 50; // Units per second
const SPEED_FRIGHT = 30;
const SPEED_GHOST_NORMAL = 45;
const SPEED_GHOST_FRIGHT = 25;
const GHOST_HOUSE_Y = 14 * TILE_SIZE; // Center of map vertically roughly

// 0: Empty, 1: Wall, 2: Pellet, 3: Power Pellet, 4: Ghost House (no entry), 5: Door
// Standard Arcade Map Layout
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
    "1111112111110110111112111111",
    "0000012110000000000112100000",
    "0000012110111551110112100000",
    "1111112110100000010112111111",
    "0000002000100000010002000000", // Tunnel row
    "1111112110100000010112111111",
    "0000012110111111110112100000",
    "0000012110000000000112100000",
    "1111112110111111110112111111",
    "1222222222222112222222222221",
    "1211112111112112111112111121",
    "1222112000000000000002112221",
    "1312112112111111112112112131",
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
 * AUDIO SYNTHESIZER (No external files)
 */
class SoundManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.15;
        this.masterGain.connect(this.ctx.destination);
    }

    playTone(freq, type, duration, time = 0) {
        if(this.ctx.state === 'suspended') this.ctx.resume();
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
        // Simple scale
        [0, 0.1, 0.2, 0.3, 0.4].forEach((t, i) => {
            this.playTone(400 + (i * 100), 'square', 0.1, t);
        });
    }

    playWaka() {
        // Debounce waka
        const now = this.ctx.currentTime;
        if (this.lastWaka && now - this.lastWaka < 0.25) return;
        this.playTone(200, 'triangle', 0.1);
        this.playTone(400, 'triangle', 0.1, 0.12);
        this.lastWaka = now;
    }

    playEatGhost() {
        this.playTone(800, 'sawtooth', 0.1);
        this.playTone(1200, 'sawtooth', 0.2, 0.1);
    }

    playDeath() {
        for(let i=0; i<10; i++) {
            this.playTone(500 - (i*50), 'sawtooth', 0.1, i*0.1);
        }
    }
}

/**
 * GAME STATE & LOGIC
 */
class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = null;
        this.renderer = null;
        this.audio = new SoundManager();
        
        this.twoPlayerMode = false;
        this.walls = [];
        this.pellets = [];
        this.actors = [];
        this.ghosts = [];
        this.players = [];
        
        this.state = 'MENU'; // MENU, READY, PLAYING, DYING, GAMEOVER
        this.level = 1;
        
        // Timer for ghosts
        this.modeTimer = 0;
        this.ghostMode = 'SCATTER'; // SCATTER, CHASE
        this.frightenedTime = 0;
        this.ghostCombo = 0;

        this.grid = []; // 2D array of maze

        this.lastFrameTime = 0;

        this.initThree();
        this.buildMaze();
        this.setupInput();
        
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

        // Render Loop
        requestAnimationFrame(this.loop.bind(this));
    }

    initThree() {
        const aspect = window.innerWidth / window.innerHeight;
        // Orthographic camera for 2.5D look
        const frustumSize = 400;
        this.camera = new THREE.OrthographicCamera(
            frustumSize * aspect / -2, frustumSize * aspect / 2,
            frustumSize / 2, frustumSize / -2,
            1, 1000
        );
        
        // Tilted view
        this.camera.position.set(0, 200, 200); 
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ 
            canvas: document.getElementById('game-canvas'), 
            antialias: true 
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x050505);

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
        dirLight.position.set(50, 100, 50);
        this.scene.add(dirLight);

        // Floor
        const floorGeo = new THREE.PlaneGeometry(1000, 1000);
        const floorMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -5;
        this.scene.add(floor);
    }

    buildMaze() {
        // Clear old maze if exists
        this.walls.forEach(w => this.scene.remove(w));
        this.pellets.forEach(p => this.scene.remove(p.mesh));
        this.walls = [];
        this.pellets = [];
        this.grid = [];

        const wallMat = new THREE.MeshLambertMaterial({ color: 0x2121de, emissive: 0x111199 });
        const pelletGeo = new THREE.SphereGeometry(1.5, 8, 8);
        const powerGeo = new THREE.SphereGeometry(3.5, 8, 8);
        const pelletMat = new THREE.MeshLambertMaterial({ color: 0xffb8ae });

        const offsetX = (MAZE_W * TILE_SIZE) / 2;
        const offsetZ = (MAZE_H * TILE_SIZE) / 2;

        for (let row = 0; row < MAP_LAYOUT.length; row++) {
            const rowArr = [];
            for (let col = 0; col < MAP_LAYOUT[row].length; col++) {
                const char = MAP_LAYOUT[row][col];
                const x = col * TILE_SIZE - offsetX + (TILE_SIZE/2);
                const z = row * TILE_SIZE - offsetZ + (TILE_SIZE/2);
                
                rowArr.push(parseInt(char));

                // 1: Wall
                if (char === '1') {
                    const h = TILE_SIZE;
                    const wGeo = new THREE.BoxGeometry(TILE_SIZE, h, TILE_SIZE);
                    // Slightly shrink to see grid lines
                    wGeo.scale(0.95, 1, 0.95); 
                    const wall = new THREE.Mesh(wGeo, wallMat);
                    wall.position.set(x, h/2 - 5, z);
                    this.scene.add(wall);
                    this.walls.push(wall);
                } 
                // 2: Pellet
                else if (char === '2') {
                    const p = new THREE.Mesh(pelletGeo, pelletMat);
                    p.position.set(x, 0, z);
                    this.scene.add(p);
                    this.pellets.push({ mesh: p, type: 'normal', x: col, z: row, active: true });
                }
                // 3: Power Pellet
                else if (char === '3') {
                    const p = new THREE.Mesh(powerGeo, pelletMat);
                    p.position.set(x, 0, z);
                    this.scene.add(p);
                    this.pellets.push({ mesh: p, type: 'power', x: col, z: row, active: true });
                }
                // 5: Door (Visual only, blocks ghosts mostly but logic handled in AI)
                else if (char === '5') {
                    const doorGeo = new THREE.BoxGeometry(TILE_SIZE, 2, TILE_SIZE/2);
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
            if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].indexOf(e.key) > -1) {
                e.preventDefault();
            }
            this.keys[e.key] = true;

            // UI Navigation
            if(this.state === 'MENU') {
                if(e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'w' || e.key === 's') {
                    this.twoPlayerMode = !this.twoPlayerMode;
                    this.updateMenuUI();
                }
                if(e.key === ' ' || e.key === 'Enter') {
                    this.startGame();
                }
            }
            // Restart
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
        // Clear old
        this.actors.forEach(a => this.scene.remove(a.mesh));
        this.players = [];
        this.ghosts = [];
        this.actors = [];

        // Player 1
        const p1 = new PacMan(this, 1, 0xffff00);
        this.players.push(p1);

        // Player 2
        if (this.twoPlayerMode) {
            const p2 = new PacMan(this, 2, 0xffb8ff); // Ms Pac color
            this.players.push(p2);
        }

        // Ghosts
        // Red, Pink, Blue(Cyan), Orange
        const colors = [0xff0000, 0xffb8ff, 0x00ffff, 0xffb852];
        const types = ['BLINKY', 'PINKY', 'INKY', 'CLYDE'];
        
        types.forEach((type, i) => {
            const g = new Ghost(this, type, colors[i]);
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
        this.ui.title.style.display = 'none';
        this.createActors();
        this.resetLevel();
        this.audio.playIntro();
        
        // Reset Scores
        this.players.forEach(p => {
            p.score = 0;
            p.lives = 3;
            p.updateUI();
        });

        setTimeout(() => {
            this.state = 'PLAYING';
        }, 4000); // Wait for intro sound roughly
    }

    resetLevel() {
        // Reset positions
        this.players.forEach(p => p.resetPosition());
        this.ghosts.forEach(g => g.resetPosition());
        
        this.state = 'READY';
        this.ui.title.style.display = 'block';
        this.ui.title.style.background = 'transparent';
        this.ui.title.style.border = 'none';
        this.ui.mainText.innerText = "READY!";
        this.ui.subText.style.display = 'none';
        document.getElementById('mode-select').style.display = "none";

        setTimeout(() => {
            if(this.state !== 'GAMEOVER') {
                this.ui.title.style.display = 'none';
                this.state = 'PLAYING';
            }
        }, 2000);
    }

    loop(time) {
        requestAnimationFrame(this.loop.bind(this));
        
        const dt = (time - this.lastFrameTime) / 1000;
        this.lastFrameTime = time;

        if (this.state === 'PLAYING') {
            // Update Ghost Modes
            if (this.frightenedTime > 0) {
                this.frightenedTime -= dt;
                if (this.frightenedTime <= 0) {
                    this.ghostMode = this.preFrightMode || 'SCATTER';
                    this.ghosts.forEach(g => g.setMode(this.ghostMode));
                }
            } else {
                this.modeTimer += dt;
                // Simple mode switching logic: 7s Scatter / 20s Chase cycle
                const cycle = this.modeTimer % 27;
                const newMode = cycle < 7 ? 'SCATTER' : 'CHASE';
                if (newMode !== this.ghostMode) {
                    this.ghostMode = newMode;
                    this.ghosts.forEach(g => g.setMode(newMode));
                }
            }

            // Update Actors
            this.players.forEach(p => {
                if(!p.dead) p.update(dt);
            });
            this.ghosts.forEach(g => g.update(dt));

            // Check Win Condition
            const remaining = this.pellets.filter(p => p.active).length;
            if(remaining === 0) {
                this.levelComplete();
            }

            // Check Game Over Condition
            const alive = this.players.filter(p => p.lives > 0).length;
            if(alive === 0) {
                this.gameOver();
            }
        }

        this.renderer.render(this.scene, this.camera);
    }

    activatePowerPellet(player) {
        this.preFrightMode = (this.ghostMode === 'FRIGHTENED') ? this.preFrightMode : this.ghostMode;
        this.ghostMode = 'FRIGHTENED';
        this.frightenedTime = 6; // 6 seconds
        this.ghostCombo = 0;
        
        this.ghosts.forEach(g => {
            g.setMode('FRIGHTENED');
            // Reverse direction immediately on frighten
            g.dir = { x: -g.dir.x, z: -g.dir.z };
        });
        
        // Slightly boost player score or combo logic here
        this.audio.playTone(600, 'sine', 0.1); // Power sound
    }

    handleGhostEat(ghost, player) {
        this.ghostCombo++;
        const score = 200 * Math.pow(2, this.ghostCombo - 1);
        player.addScore(score);
        ghost.setMode('EATEN');
        this.audio.playEatGhost();
    }

    playerDied(player) {
        player.lives--;
        player.dead = true;
        player.mesh.visible = false; // Hide immediately
        player.updateUI();
        this.audio.playDeath();

        // Check if all dead
        const allDead = this.players.every(p => p.dead || p.lives <= 0);
        
        if (allDead) {
            this.state = 'DYING';
            setTimeout(() => {
                // If lives remain, reset level. Else Game Over.
                const anyLives = this.players.some(p => p.lives > 0);
                if (anyLives) {
                    this.players.forEach(p => {
                        if (p.lives > 0) {
                            p.dead = false;
                            p.mesh.visible = true;
                        }
                    });
                    this.resetLevel();
                } else {
                    this.gameOver();
                }
            }, 2000);
        }
    }

    levelComplete() {
        this.state = 'READY';
        this.audio.playIntro(); // Victory jingle placeholder
        setTimeout(() => {
            this.level++;
            this.buildMaze(); // Reset pellets
            this.resetLevel();
        }, 3000);
    }

    gameOver() {
        this.state = 'GAMEOVER';
        this.ui.title.style.display = 'block';
        this.ui.title.style.background = 'rgba(0,0,0,0.9)';
        this.ui.title.style.border = '2px solid red';
        this.ui.mainText.innerText = "GAME OVER";
        this.ui.subText.innerText = "PRESS SPACE TO RESTART";
        this.ui.subText.style.display = 'block';
        document.getElementById('mode-select').style.display = "none";
    }

    // Utility: Is tile walkable?
    isWalkable(c, r, isGhost = false) {
        if (r < 0 || r >= MAZE_H || c < 0 || c >= MAZE_W) return false; // Bounds
        const val = this.grid[r][c];
        if (val === 1) return false; // Wall
        if (isGhost && val === 5) return false; // Ghost House Door (usually ghosts can exit but strictly not enter unless dead)
        // Tunnel Logic: handled in movement update
        return true;
    }
}

/**
 * BASE ACTOR CLASS (Movement & Collision)
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
        const offsetX = (MAZE_W * TILE_SIZE) / 2;
        const offsetZ = (MAZE_H * TILE_SIZE) / 2;
        this.pixelPos.x = col * TILE_SIZE - offsetX + (TILE_SIZE/2);
        this.pixelPos.z = row * TILE_SIZE - offsetZ + (TILE_SIZE/2);
        this.updateMeshPos();
    }

    updateMeshPos() {
        this.mesh.position.set(this.pixelPos.x, 0, this.pixelPos.z);
    }

    // Check if actor is exactly at the center of a tile (within small threshold)
    isAtCenter() {
        const offsetX = (MAZE_W * TILE_SIZE) / 2;
        const offsetZ = (MAZE_H * TILE_SIZE) / 2;
        
        const idealX = this.tilePos.col * TILE_SIZE - offsetX + (TILE_SIZE/2);
        const idealZ = this.tilePos.row * TILE_SIZE - offsetZ + (TILE_SIZE/2);

        return (Math.abs(this.pixelPos.x - idealX) < 0.5 && Math.abs(this.pixelPos.z - idealZ) < 0.5);
    }
    
    snapToCenter() {
        const offsetX = (MAZE_W * TILE_SIZE) / 2;
        const offsetZ = (MAZE_H * TILE_SIZE) / 2;
        this.pixelPos.x = this.tilePos.col * TILE_SIZE - offsetX + (TILE_SIZE/2);
        this.pixelPos.z = this.tilePos.row * TILE_SIZE - offsetZ + (TILE_SIZE/2);
        this.updateMeshPos();
    }

    move(dt) {
        // Simple Euler integration
        this.pixelPos.x += this.dir.x * this.speed * dt;
        this.pixelPos.z += this.dir.z * this.speed * dt;

        // Tunnel Wrap
        const offsetX = (MAZE_W * TILE_SIZE) / 2;
        if (this.pixelPos.x > offsetX) {
            this.pixelPos.x = -offsetX;
            this.tilePos.col = 0;
        } else if (this.pixelPos.x < -offsetX) {
            this.pixelPos.x = offsetX;
            this.tilePos.col = MAZE_W - 1;
        }

        // Update grid coordinates based on pixel position
        const gridX = Math.floor((this.pixelPos.x + offsetX) / TILE_SIZE);
        const gridZ = Math.floor((this.pixelPos.z + (MAZE_H * TILE_SIZE) / 2) / TILE_SIZE);
        
        // Basic clamp to avoid index out of bounds during tunnel transition
        this.tilePos.col = Math.max(0, Math.min(MAZE_W-1, gridX));
        this.tilePos.row = Math.max(0, Math.min(MAZE_H-1, gridZ));

        this.updateMeshPos();
    }
}

/**
 * PAC-MAN
 */
class PacMan extends Actor {
    constructor(game, id, color) {
        super(game);
        this.id = id; // 1 or 2
        this.score = 0;
        this.lives = 3;
        this.dead = false;

        // Visuals
        const geo = new THREE.SphereGeometry(4, 16, 16, 0, Math.PI * 2, 0.2, Math.PI - 0.4);
        const mat = new THREE.MeshLambertMaterial({ color: color });
        this.body = new THREE.Mesh(geo, mat);
        // Rotate so the "mouth" (gap in sphere) faces forward
        this.body.rotation.x = -Math.PI/2; 
        this.mesh.add(this.body);

        this.resetPosition();
    }

    resetPosition() {
        this.dir = NONE;
        this.nextDir = NONE;
        this.dead = false;
        this.mesh.visible = true;
        this.body.rotation.z = 0;
        
        // P1 Start: Row 23, Col 13/14
        // P2 Start: Offset slightly
        if (this.id === 1) this.setTile(13, 23);
        else this.setTile(14, 23);
    }

    updateUI() {
        if(this.id === 1) {
            this.game.ui.p1Score.innerText = this.score;
            this.game.ui.p1Lives.innerText = "❤".repeat(this.lives);
        } else {
            this.game.ui.p2Score.innerText = this.score;
            this.game.ui.p2Lives.innerText = "❤".repeat(this.lives);
        }
    }

    addScore(points) {
        this.score += points;
        this.updateUI();
        // High Score logic
        const hs = document.getElementById('high-score');
        const currentHi = parseInt(hs.innerText) || 0;
        if(this.score > currentHi) hs.innerText = this.score;
    }

    getInput() {
        // P1: Arrows, P2: WASD
        if (this.id === 1) {
            if (this.game.keys['ArrowUp']) return UP;
            if (this.game.keys['ArrowDown']) return DOWN;
            if (this.game.keys['ArrowLeft']) return LEFT;
            if (this.game.keys['ArrowRight']) return RIGHT;
        } else {
            if (this.game.keys['w']) return UP;
            if (this.game.keys['s']) return DOWN;
            if (this.game.keys['a']) return LEFT;
            if (this.game.keys['d']) return RIGHT;
        }
        return NONE;
    }

    update(dt) {
        if (this.dead) return;

        // Mouth Animation
        if (this.dir !== NONE) {
            const time = Date.now() * 0.015;
            const mouthSize = (Math.sin(time) + 1) * 0.2 + 0.1; // 0.1 to 0.5
            // Three.js SphereGeometry parameters modification is tricky in realtime, 
            // usually easier to rotate two halves. For this simple version, we scale Y slightly.
            this.body.scale.set(1, 1 - (Math.sin(time)*0.2), 1);
        }

        // Input Handling
        const input = this.getInput();
        if (input !== NONE) this.nextDir = input;

        // Movement Logic
        if (this.isAtCenter()) {
            this.snapToCenter(); // Keep aligned

            // Try to turn
            if (this.nextDir !== NONE) {
                if (this.game.isWalkable(this.tilePos.col + this.nextDir.x, this.tilePos.row + this.nextDir.z)) {
                    // Check Collision with other player
                    const otherPlayer = this.game.players.find(p => p !== this);
                    const targetCol = this.tilePos.col + this.nextDir.x;
                    const targetRow = this.tilePos.row + this.nextDir.z;
                    
                    let blocked = false;
                    if(otherPlayer && !otherPlayer.dead && otherPlayer.tilePos.col === targetCol && otherPlayer.tilePos.row === targetRow) {
                        blocked = true;
                    }

                    if(!blocked) {
                        this.dir = this.nextDir;
                        this.nextDir = NONE;
                        // Rotate mesh
                        if(this.dir === UP) this.body.rotation.z = Math.PI; // Face up (geometry dependent)
                        if(this.dir === DOWN) this.body.rotation.z = 0;
                        if(this.dir === LEFT) this.body.rotation.z = -Math.PI/2;
                        if(this.dir === RIGHT) this.body.rotation.z = Math.PI/2;
                    }
                }
            }

            // Check if can continue current dir
            if (!this.game.isWalkable(this.tilePos.col + this.dir.x, this.tilePos.row + this.dir.z)) {
                this.dir = NONE;
            } else {
                // Check player collision in current dir
                 const otherPlayer = this.game.players.find(p => p !== this);
                 const targetCol = this.tilePos.col + this.dir.x;
                 const targetRow = this.tilePos.row + this.dir.z;
                 if(otherPlayer && !otherPlayer.dead && otherPlayer.tilePos.col === targetCol && otherPlayer.tilePos.row === targetRow && otherPlayer.dir === NONE) {
                    this.dir = NONE; // Blocked by idle player
                 }
            }
        }

        this.move(dt);

        // Pellet Collision
        const pIndex = this.game.pellets.findIndex(p => p.active && p.x === this.tilePos.col && p.z === this.tilePos.row);
        if (pIndex !== -1) {
            const pellet = this.game.pellets[pIndex];
            pellet.active = false;
            pellet.mesh.visible = false;
            
            if (pellet.type === 'normal') {
                this.addScore(10);
                this.game.audio.playWaka();
            } else {
                this.addScore(50);
                this.game.activatePowerPellet(this);
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
        this.type = type; // BLINKY, PINKY, INKY, CLYDE
        this.baseColor = color;
        this.mode = 'SCATTER'; // SCATTER, CHASE, FRIGHTENED, EATEN

        // Shape: Cylinder with round top
        const geo = new THREE.CapsuleGeometry(3.5, 4, 4, 8);
        this.mat = new THREE.MeshLambertMaterial({ color: color });
        this.body = new THREE.Mesh(geo, this.mat);
        this.body.position.y = 2;
        this.mesh.add(this.body);

        // Eyes
        const eyeGeo = new THREE.SphereGeometry(1, 8, 8);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const pupilGeo = new THREE.SphereGeometry(0.5, 8, 8);
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x0000dd });

        this.eyes = new THREE.Group();
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-1.5, 3, 2);
        rightEye.position.set(1.5, 3, 2);
        
        const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
        const rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
        leftPupil.position.set(0, 0, 0.8);
        rightPupil.position.set(0, 0, 0.8);
        
        leftEye.add(leftPupil);
        rightEye.add(rightPupil);
        this.eyes.add(leftEye);
        this.eyes.add(rightEye);
        this.mesh.add(this.eyes);

        this.resetPosition();
    }

    resetPosition() {
        this.setMode('SCATTER');
        this.dir = LEFT; // Start moving
        if(this.type === 'BLINKY') this.setTile(13, 11); // Outside
        else if(this.type === 'PINKY') this.setTile(13, 14); // Inside
        else if(this.type === 'INKY') this.setTile(11, 14);
        else if(this.type === 'CLYDE') this.setTile(15, 14);
    }

    setMode(mode) {
        this.mode = mode;
        if (mode === 'FRIGHTENED') {
            this.mat.color.setHex(0x0000ff); // Blue
            this.speed = SPEED_GHOST_FRIGHT;
        } else if (mode === 'EATEN') {
            this.mat.visible = false; // Eyes only
            this.speed = 100; // Fast return
        } else {
            this.mat.visible = true;
            this.mat.color.setHex(this.baseColor);
            this.speed = SPEED_GHOST_NORMAL;
        }
    }

    getTarget() {
        if (this.mode === 'EATEN') return { col: 13, row: 11 }; // Ghost house door

        // 2-Player Logic: Target Closest Alive Player
        const alivePlayers = this.game.players.filter(p => !p.dead);
        if(alivePlayers.length === 0) return { col: this.tilePos.col, row: this.tilePos.row };

        let targetPlayer = alivePlayers[0];
        if (alivePlayers.length > 1) {
            const d1 = Math.abs(this.tilePos.col - alivePlayers[0].tilePos.col) + Math.abs(this.tilePos.row - alivePlayers[0].tilePos.row);
            const d2 = Math.abs(this.tilePos.col - alivePlayers[1].tilePos.col) + Math.abs(this.tilePos.row - alivePlayers[1].tilePos.row);
            if (d2 < d1) targetPlayer = alivePlayers[1];
        }

        const px = targetPlayer.tilePos.col;
        const py = targetPlayer.tilePos.row;
        const pDir = targetPlayer.dir;

        if (this.mode === 'SCATTER') {
            // Corners
            if (this.type === 'BLINKY') return { col: MAZE_W-2, row: 0 };
            if (this.type === 'PINKY') return { col: 1, row: 0 };
            if (this.type === 'INKY') return { col: MAZE_W-1, row: MAZE_H-1 };
            if (this.type === 'CLYDE') return { col: 0, row: MAZE_H-1 };
        }

        if (this.mode === 'CHASE') {
            if (this.type === 'BLINKY') return { col: px, row: py };
            if (this.type === 'PINKY') return { col: px + pDir.x * 4, row: py + pDir.z * 4 };
            if (this.type === 'INKY') {
                // Complex vector math simplified
                const tx = px + pDir.x * 2;
                const ty = py + pDir.z * 2;
                // Vector from Blinky to pivot
                return { col: tx, row: ty }; // Simplified
            }
            if (this.type === 'CLYDE') {
                const dist = Math.sqrt(Math.pow(this.tilePos.col - px, 2) + Math.pow(this.tilePos.row - py, 2));
                return (dist > 8) ? { col: px, row: py } : { col: 0, row: MAZE_H-1 };
            }
        }
        
        // Random wander for frightened is handled in movement decision
        return { col: px, row: py };
    }

    update(dt) {
        if (this.isAtCenter()) {
            this.snapToCenter();

            if (this.mode === 'EATEN' && this.tilePos.col === 13 && this.tilePos.row === 11) {
                this.setMode('CHASE'); // Respawned
            }

            // Decide next direction
            const target = this.getTarget();
            const possible = [UP, DOWN, LEFT, RIGHT];
            const validDirs = possible.filter(d => {
                // Cannot reverse immediately (unless frightened logic triggered elsewhere)
                if (d.x === -this.dir.x && d.z === -this.dir.z && this.mode !== 'FRIGHTENED') return false;
                
                const nextC = this.tilePos.col + d.x;
                const nextR = this.tilePos.row + d.z;
                // Specific Ghost House logic: only UP allowed if in center
                if (this.game.grid[this.tilePos.row][this.tilePos.col] === 4) {
                     // In house
                     return this.game.isWalkable(nextC, nextR, true) || this.game.grid[nextR][nextC] === 5; 
                }
                
                return this.game.isWalkable(nextC, nextR, this.mode !== 'EATEN');
            });

            if (validDirs.length > 0) {
                if (this.mode === 'FRIGHTENED') {
                    // Random choice
                    this.dir = validDirs[Math.floor(Math.random() * validDirs.length)];
                } else {
                    // Choose dir minimizing distance to target
                    let bestDir = validDirs[0];
                    let minDist = 999999;
                    
                    validDirs.forEach(d => {
                        const nc = this.tilePos.col + d.x;
                        const nr = this.tilePos.row + d.z;
                        const dist = Math.pow(nc - target.col, 2) + Math.pow(nr - target.row, 2);
                        if (dist < minDist) {
                            minDist = dist;
                            bestDir = d;
                        }
                    });
                    this.dir = bestDir;
                }
            } else {
                // Dead end (shouldn't happen in standard maze)
                this.dir = { x: -this.dir.x, z: -this.dir.z };
            }

            // Rotate Eyes
            if(this.dir === UP) this.eyes.rotation.y = Math.PI;
            if(this.dir === DOWN) this.eyes.rotation.y = 0;
            if(this.dir === LEFT) this.eyes.rotation.y = -Math.PI/2;
            if(this.dir === RIGHT) this.eyes.rotation.y = Math.PI/2;
        }

        this.move(dt);

        // Collision with Players
        this.game.players.forEach(p => {
            if(p.dead) return;
            const dx = Math.abs(p.pixelPos.x - this.pixelPos.x);
            const dz = Math.abs(p.pixelPos.z - this.pixelPos.z);
            
            if (dx < 5 && dz < 5) { // Collision Threshold
                if (this.mode === 'FRIGHTENED') {
                    this.game.handleGhostEat(this, p);
                } else if (this.mode !== 'EATEN') {
                    this.game.playerDied(p);
                }
            }
        });
    }
}

// Start
new Game();
