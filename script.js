/**
 * --- START OF FILE script.js ---
 */
import * as THREE from 'three';

/**
 * --- CONFIGURATION & CONSTANTS ---
 */
const TILE_SIZE = 10;
const WALL_HEIGHT = 2.5;
const WALL_THICKNESS = 4;

// Default Dimensions for Random/Original
const DEFAULT_W = 28;
const DEFAULT_H = 31;

// Speeds (Units per second)
const SPEED_NORMAL = 50; 
const SPEED_FRIGHT = 35;
const SPEED_GHOST_NORMAL = 45;
const SPEED_GHOST_FRIGHT = 25;
const SPEED_DEMO_BOT = 55;

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
    "9999992999144444419992999999", // Tunnel Row (Index 13)
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
 * --- PROCEDURAL MAP GENERATOR (With Fixed Ghost Exit) ---
 */
class MazeGenerator {
    static generate(width, height, mirrored = true) {
        let w = width;
        let h = height;
        
        let grid = Array(h).fill().map(() => Array(w).fill(1));

        const setCell = (x, y, val) => {
            if (x >= 0 && x < w && y >= 0 && y < h) {
                grid[y][x] = val;
                if (mirrored) grid[y][w - 1 - x] = val;
            }
        };

        const cx = Math.floor(w / 2);
        const cy = Math.floor(h / 2);

        // Define Ghost House Dimensions
        const houseW = 6;
        const houseH = 4;
        const houseX = cx - Math.floor(houseW/2);
        const houseY = cy - Math.floor(houseH/2);

        // DFS Maze Gen
        const stack = [];
        
        // Start digging exactly above the ghost house door
        const startX = cx; 
        const startY = houseY - 2; 

        if (startY < 1) return grid;

        const visited = new Set();
        const key = (x,y) => `${x},${y}`;
        const isVisited = (x, y) => visited.has(key(x,y));

        const dig = (sx, sy) => {
            stack.push({x: sx, y: sy});
            visited.add(key(sx,sy));
            setCell(sx, sy, 0);

            while(stack.length > 0) {
                const current = stack[stack.length - 1];
                const neighbors = [];
                // Look 2 steps
                [{dx:0, dy:-2}, {dx:0, dy:2}, {dx:-2, dy:0}, {dx:2, dy:0}].forEach(d => {
                    const nx = current.x + d.dx;
                    const ny = current.y + d.dy;
                    
                    const limitX = mirrored ? cx - 1 : w - 2;
                    
                    if (nx > 0 && nx <= limitX && ny > 0 && ny < h - 1) {
                         // Don't dig INTO the ghost house, but allow digging AROUND it.
                         if (Math.abs(nx - cx) > houseW/2 + 1 || Math.abs(ny - cy) > houseH/2 + 1) {
                             if(!isVisited(nx, ny)) neighbors.push({x: nx, y: ny, dx: d.dx, dy: d.dy});
                         }
                    }
                });

                if(neighbors.length > 0) {
                    const chosen = neighbors[Math.floor(Math.random() * neighbors.length)];
                    setCell(current.x + chosen.dx/2, current.y + chosen.dy/2, 0);
                    setCell(chosen.x, chosen.y, 0);
                    visited.add(key(chosen.x, chosen.y));
                    stack.push({x: chosen.x, y: chosen.y});
                } else {
                    stack.pop();
                }
            }
        };

        dig(startX, startY);

        // Enforce Ghost House Walls & Interior
        for(let y = houseY - 1; y <= houseY + houseH; y++) {
            for(let x = houseX - 1; x <= houseX + houseW; x++) {
                if (y >= houseY && y < houseY + houseH && x >= houseX && x < houseX + houseW) {
                   grid[y][x] = 9; // Ghost zone
                   if(mirrored) grid[y][w - 1 - x] = 9;
                } else {
                   grid[y][x] = 1; // Walls around house
                   if(mirrored) grid[y][w - 1 - x] = 1;
                }
            }
        }
        
        // Carve Door & Exit Path Explicitly
        grid[houseY-1][cx] = 5; 
        grid[houseY-2][cx] = 0; 
        
        if(w % 2 === 0) {
             grid[houseY-1][cx-1] = 5;
             grid[houseY-2][cx-1] = 0;
        }

        // Add random loops
        const density = 0.15; 
        for(let y=1; y<h-1; y++) {
            for(let x=1; x<(mirrored ? cx : w-1); x++) {
                if(grid[y][x] === 1 && Math.random() < density) {
                    let paths = 0;
                    if(grid[y-1][x]!==1) paths++;
                    if(grid[y+1][x]!==1) paths++;
                    if(grid[y][x-1]!==1) paths++;
                    if(grid[y][x+1]!==1) paths++;
                    if(paths >= 2) setCell(x,y,0);
                }
            }
        }

        // Add Tunnel
        const tunnelY = Math.floor(h * 0.45);
        for(let x=0; x<w; x++) {
            grid[tunnelY][x] = (x < 5 || x > w-6) ? 0 : grid[tunnelY][x];
            if(x===5) grid[tunnelY][x] = 0;
            if(x===w-6) grid[tunnelY][x] = 0;
        }

        // Fill Pellets
        for(let y=1; y<h-1; y++) {
            for(let x=1; x<w-1; x++) {
                const inHouse = (x >= houseX && x < houseX+houseW && y >= houseY && y < houseY+houseH);
                const isExit = (x === cx && y === houseY - 2) || (w%2===0 && x === cx-1 && y === houseY-2);
                if(grid[y][x] === 0 && !inHouse && !isExit) grid[y][x] = 2;
            }
        }

        // Power Pellets
        [ {c:1, r:1}, {c:1, r:h-2}, {c:w-2, r:1}, {c:w-2, r:h-2} ].forEach(p => {
             if(grid[p.r] && grid[p.r][p.c] !== 1) grid[p.r][p.c] = 3;
        });

        // Ensure Spawn is empty inside house
        grid[houseY][cx] = 9; 
        if(w % 2 === 0) grid[houseY][cx-1] = 9;
        
        return grid;
    }
}

/**
 * --- AUDIO SYNTHESIZER ---
 */
class SoundManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.10; 
        this.masterGain.connect(this.ctx.destination);
        this.enabled = false;
        this.lastWaka = 0;
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
        if (this.lastWaka && now - this.lastWaka < 0.14) return;
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
 * --- BASE ACTOR CLASS ---
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

        // Tunnel Wrapping
        const limit = (this.game.mapW * TILE_SIZE) / 2 + TILE_SIZE;
        if (this.pixelPos.x > limit) { this.pixelPos.x = -limit + 5; this.tilePos.col = 0; }
        else if (this.pixelPos.x < -limit) { this.pixelPos.x = limit - 5; this.tilePos.col = this.game.mapW - 1; }

        const offsetX = (this.game.mapW * TILE_SIZE) / 2;
        const offsetZ = (this.game.mapH * TILE_SIZE) / 2;
        this.tilePos.col = Math.floor((this.pixelPos.x + offsetX) / TILE_SIZE);
        this.tilePos.row = Math.floor((this.pixelPos.z + offsetZ) / TILE_SIZE);

        this.mesh.position.set(this.pixelPos.x, 0, this.pixelPos.z);
        
        return { reachedCenter, remainingDt: moveAmt > 0 ? moveAmt / this.speed : 0 };
    }
}

/**
 * --- PLAYER CLASS ---
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
        
        const cx = Math.floor(this.game.mapW/2);
        const cy = Math.floor(this.game.mapH/2);
        
        let spawnR = cy + 5;
        let spawnC = this.id === 1 ? cx - 1 : cx + 1;
        
        // Ensure spawn is within bounds
        if(spawnR >= this.game.mapH) spawnR = this.game.mapH - 2;
        if(spawnC >= this.game.mapW) spawnC = 1;
        if(!this.game.isWalkable(spawnC, spawnR)) {
             spawnR = this.game.mapH - 2;
        }

        this.setTile(spawnC, spawnR);
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

    // --- REVISED AI BOT LOGIC FOR DEMO ---
    updateAI() {
        // Only think if we are at the center of a tile to make clean turns
        const center = this.game.getPixelForTile(this.tilePos.col, this.tilePos.row);
        if (this.dir !== NONE && Math.abs(center.x - this.pixelPos.x) > 1) return;
        if (this.dir !== NONE && Math.abs(center.z - this.pixelPos.z) > 1) return;
        
        // 1. Analyze Environment
        const ghosts = this.game.ghosts.filter(g => g.mode !== 'EATEN');
        const dangerous = ghosts.filter(g => g.mode !== 'FRIGHTENED');
        const huntable = ghosts.filter(g => g.mode === 'FRIGHTENED');
        const powerPellets = this.game.pellets.filter(p => p.active && p.type === 'power');

        // 2. Determine Valid Immediate Moves
        const moves = [UP, DOWN, LEFT, RIGHT];
        const validMoves = moves.filter(d => this.game.isWalkable(this.tilePos.col + d.x, this.tilePos.row + d.z));

        // 3. Safety Filter (Filter out immediate suicide)
        const safeMoves = validMoves.filter(d => {
            const nx = this.tilePos.col + d.x;
            const ny = this.tilePos.row + d.z;
            return !dangerous.some(g => Math.abs(g.tilePos.col - nx) + Math.abs(g.tilePos.row - ny) < 2);
        });

        // Use safe moves if available, else panic with any valid move
        const candidates = safeMoves.length > 0 ? safeMoves : validMoves;
        if (candidates.length === 0) return;

        // Helper: BFS Pathfinding
        // allowRisk: if false, treats tiles near dangerous ghosts as walls (ensures "path is clear")
        const getBestMove = (targets, allowRisk) => {
            const queue = [{ c: this.tilePos.col, r: this.tilePos.row, firstMove: null }];
            const visited = new Set();
            visited.add(`${this.tilePos.col},${this.tilePos.row}`);

            // If not allowing risk, block out dangerous ghost areas in the search
            if (!allowRisk) {
                dangerous.forEach(g => {
                    visited.add(`${g.tilePos.col},${g.tilePos.row}`);
                    moves.forEach(m => visited.add(`${g.tilePos.col + m.x},${g.tilePos.row + m.z}`));
                });
            }

            while(queue.length > 0) {
                const cur = queue.shift();

                // Check if current tile is a target
                if (targets.some(g => g.c === cur.c && g.r === cur.r)) {
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

        // PRIORITY 1: Hunt Blue Ghosts (Allow risk because we want to eat them)
        if (huntable.length > 0) {
            const targets = huntable.map(g => ({ c: g.tilePos.col, r: g.tilePos.row }));
            targetMove = getBestMove(targets, true);
        }

        // PRIORITY 2: Go for Power Pellet (Only if path is clear of dangerous ghosts)
        if (!targetMove && powerPellets.length > 0) {
            const targets = powerPellets.map(p => ({c: p.x, r: p.z}));
            targetMove = getBestMove(targets, false); // Strict safety
        }

        // PRIORITY 3: Normal Pellets (Only if path is clear)
        if (!targetMove) {
            // Optimization: Only search a few close pellets to save CPU
            const pellets = this.game.pellets.filter(p => p.active);
            const sortedPellets = pellets.sort((a,b) => {
                const da = Math.abs(a.x - this.tilePos.col) + Math.abs(a.z - this.tilePos.row);
                const db = Math.abs(b.x - this.tilePos.col) + Math.abs(b.z - this.tilePos.row);
                return da - db;
            }).slice(0, 10);
            
            if(sortedPellets.length > 0) {
                const targets = sortedPellets.map(p => ({c: p.x, r: p.z}));
                targetMove = getBestMove(targets, false);
            }
        }

        // EXECUTION
        if (targetMove && candidates.includes(targetMove)) {
            this.nextDir = targetMove;
        } else {
            // BLOCKED / EVASIVE MANEUVER
            // If we are here, either there are no targets, or the path to them is blocked by a ghost.
            // We must take a different direction to maximize distance from threats.
            
            if (dangerous.length > 0) {
                let bestEscape = candidates[0];
                let maxDist = -1;

                candidates.forEach(m => {
                    const nx = this.tilePos.col + m.x;
                    const ny = this.tilePos.row + m.z;
                    
                    // Calculate distance to nearest dangerous ghost for this move candidate
                    let minGhostDist = 9999;
                    dangerous.forEach(g => {
                        const dist = Math.abs(g.tilePos.col - nx) + Math.abs(g.tilePos.row - ny);
                        if(dist < minGhostDist) minGhostDist = dist;
                    });

                    // Choose move that keeps us furthest from danger
                    if(minGhostDist > maxDist) {
                        maxDist = minGhostDist;
                        bestEscape = m;
                    }
                });
                this.nextDir = bestEscape;
            } else {
                // If safe and no targets (rare), just wander randomly
                this.nextDir = candidates[Math.floor(Math.random() * candidates.length)];
            }
        }
    }

    update(dt) {
        if (this.dead) return;

        if (this.dir !== NONE) {
            const t = Date.now() * 0.02;
            this.body.scale.set(1, 1 - (Math.sin(t)+1)*0.1, 1);
        }

        let input = NONE;
        
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
            if (input !== NONE) this.nextDir = input;
        }

        const result = this.drive(dt);

        if (result.reachedCenter || this.dir === NONE) {
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
 * --- GHOST CLASS ---
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

        this.eyes = new THREE.Group();
        const eyeGeo = new THREE.SphereGeometry(1.2, 8, 8);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const pupilGeo = new THREE.SphereGeometry(0.6, 8, 8);
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x0000dd });
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
        const cx = Math.floor(this.game.mapW/2);
        const cy = Math.floor(this.game.mapH/2);
        
        // House Positions
        if(this.type === 'BLINKY') this.setTile(cx, cy - 2); 
        else if(this.type === 'PINKY') this.setTile(cx, cy); 
        else if(this.type === 'INKY') this.setTile(cx - 2, cy); 
        else if(this.type === 'CLYDE') this.setTile(cx + 2, cy); 
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
        const cx = Math.floor(this.game.mapW/2);
        const cy = Math.floor(this.game.mapH/2);
        if (this.mode === 'EATEN') return { col: cx, row: cy - 2 };

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
             if (this.type === 'BLINKY') return { col: this.game.mapW-2, row: 0 };
             if (this.type === 'PINKY') return { col: 1, row: 0 };
             if (this.type === 'INKY') return { col: this.game.mapW-1, row: this.game.mapH-1 };
             if (this.type === 'CLYDE') return { col: 0, row: this.game.mapH-1 };
        }
        return { col: tx, row: ty };
    }

    update(dt) {
        const result = this.drive(dt);

        if (result.reachedCenter) {
            const cx = Math.floor(this.game.mapW/2);
            const cy = Math.floor(this.game.mapH/2);

            if (this.mode === 'EATEN' && Math.abs(this.tilePos.col - cx) < 2 && Math.abs(this.tilePos.row - (cy-2)) < 2) {
                this.setMode('CHASE');
                this.dir = DOWN; 
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

/**
 * --- MAIN GAME ENGINE ---
 */
class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.audio = new SoundManager();
        
        this.twoPlayerMode = false;
        this.mapStyle = 'ORIGINAL';
        this.isDemo = false; 
        
        // Custom Options
        this.optionsOpen = false;
        this.customConfig = {
            width: 28,
            height: 31,
            algo: 'MIRRORED', // MIRRORED, PURE
            color: 'CLASSIC' // CLASSIC, NEON, RED, MONO
        };

        this.mapW = 28;
        this.mapH = 31;
        
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

        this.lastInputTime = Date.now();
        this.lastFrameTime = 0;
        this.accumulator = 0;
        this.fixedStep = 1 / 60;

        // UI References
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
            btnStart: document.getElementById('btn-start-game'),
            notify: document.getElementById('gamepad-notify'),
            optionsMenu: document.getElementById('options-menu'),
            // Option Elements
            optWVal: document.getElementById('opt-w-val'),
            optHVal: document.getElementById('opt-h-val'),
            optAlgoBtn: document.getElementById('opt-algo-toggle'),
            optColorBtn: document.getElementById('opt-color-toggle')
        };

        this.initThree();
        this.setupOptionsListeners();
        this.buildMaze();
        this.setupInput();

        requestAnimationFrame(this.loop.bind(this));
    }

    initThree() {
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
        this.floor = new THREE.Mesh(
            new THREE.PlaneGeometry(1000, 1000), 
            new THREE.MeshBasicMaterial({ color: 0x000000 })
        );
        this.floor.rotation.x = -Math.PI / 2;
        this.floor.position.y = -5;
        this.scene.add(this.floor);

        this.updateCamera();

        window.addEventListener('resize', () => {
            this.updateCamera();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    updateCamera() {
        const maxDim = Math.max(this.mapW, this.mapH);
        const frustumSize = maxDim * TILE_SIZE * 1.3; 
        const aspect = window.innerWidth / window.innerHeight;

        if(!this.camera) {
            this.camera = new THREE.OrthographicCamera(
                frustumSize * aspect / -2, frustumSize * aspect / 2,
                frustumSize / 2, frustumSize / -2,
                1, 2000
            );
        } else {
            this.camera.left = frustumSize * aspect / -2;
            this.camera.right = frustumSize * aspect / 2;
            this.camera.top = frustumSize / 2;
            this.camera.bottom = frustumSize / -2;
            this.camera.updateProjectionMatrix();
        }

        this.camera.position.set(0, 400, 300); 
        this.camera.lookAt(0, 0, 0);
    }

    setupOptionsListeners() {
        const u = this.ui;
        // Width
        document.getElementById('opt-w-dec').onclick = () => {
            this.customConfig.width = Math.max(20, this.customConfig.width - 2);
            u.optWVal.innerText = this.customConfig.width;
        };
        document.getElementById('opt-w-inc').onclick = () => {
            this.customConfig.width = Math.min(60, this.customConfig.width + 2);
            u.optWVal.innerText = this.customConfig.width;
        };
        // Height
        document.getElementById('opt-h-dec').onclick = () => {
            this.customConfig.height = Math.max(20, this.customConfig.height - 2);
            u.optHVal.innerText = this.customConfig.height;
        };
        document.getElementById('opt-h-inc').onclick = () => {
            this.customConfig.height = Math.min(60, this.customConfig.height + 2);
            u.optHVal.innerText = this.customConfig.height;
        };
        // Algo
        u.optAlgoBtn.onclick = () => {
            this.customConfig.algo = this.customConfig.algo === 'MIRRORED' ? 'PURE' : 'MIRRORED';
            u.optAlgoBtn.innerText = this.customConfig.algo;
        };
        // Color
        const themes = ['CLASSIC', 'NEON', 'RED', 'MONO'];
        u.optColorBtn.onclick = () => {
            let idx = themes.indexOf(this.customConfig.color);
            idx = (idx + 1) % themes.length;
            this.customConfig.color = themes[idx];
            u.optColorBtn.innerText = this.customConfig.color;
        };
        // Close
        document.getElementById('btn-close-options').onclick = () => this.toggleOptions();
    }

    toggleOptions() {
        this.optionsOpen = !this.optionsOpen;
        if(this.optionsOpen) {
            this.ui.optionsMenu.classList.remove('hidden');
            this.ui.title.style.display = 'none'; 
        } else {
            this.ui.optionsMenu.classList.add('hidden');
            if(this.state === 'MENU') this.ui.title.style.display = 'block';
            
            // Set mode to custom if options changed
            this.mapStyle = 'CUSTOM';
            this.ui.subText.innerText = `MAP: CUSTOM (${this.customConfig.width}x${this.customConfig.height})`;
        }
    }

    showNotification(msg) {
        const div = document.createElement('div');
        div.className = 'gp-toast';
        div.innerText = msg;
        this.ui.notify.appendChild(div);
        setTimeout(() => div.remove(), 3000);
    }

    resetIdleTimer() {
        this.lastInputTime = Date.now();
        this.ui.demoText.classList.add('hidden');
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
                    if (this.state === 'MENU' && pressed && !this.optionsOpen) {
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
        
        let gridLayout = [];

        // Determine Size and Logic
        if (this.mapStyle === 'ORIGINAL') {
            // Parse the restored original map
            gridLayout = MAP_LAYOUT.map(row => row.split('').map(c => parseInt(c)));
        } else if (this.mapStyle === 'RANDOM') {
            gridLayout = MazeGenerator.generate(DEFAULT_W, DEFAULT_H, true);
        } else if (this.mapStyle === 'CUSTOM') {
            gridLayout = MazeGenerator.generate(this.customConfig.width, this.customConfig.height, this.customConfig.algo === 'MIRRORED');
        }

        // Dynamically set size based on generated/loaded grid to prevent crashes
        this.mapH = gridLayout.length;
        this.mapW = gridLayout[0].length;
        this.grid = gridLayout;

        // Determine Colors
        let wallC = 0x2121de;
        let wallE = 0x080890;
        
        if (this.mapStyle === 'CUSTOM') {
             switch(this.customConfig.color) {
                 case 'RED': wallC = 0xde2121; wallE = 0x500808; break;
                 case 'NEON': wallC = 0x00ff00; wallE = 0x004000; break;
                 case 'MONO': wallC = 0xaaaaaa; wallE = 0x222222; break;
             }
        } else if (this.mapStyle === 'RANDOM') {
             wallC = Math.random() * 0xffffff;
             wallE = 0x111111;
        }

        const wallMat = new THREE.MeshLambertMaterial({ color: wallC, emissive: wallE });
        const pelletMat = new THREE.MeshLambertMaterial({ color: 0xffb8ae });
        
        const jointGeo = new THREE.CylinderGeometry(WALL_THICKNESS/2, WALL_THICKNESS/2, WALL_HEIGHT, 16);
        const hConnGeo = new THREE.BoxGeometry(TILE_SIZE, WALL_HEIGHT, WALL_THICKNESS); 
        const vConnGeo = new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, TILE_SIZE); 
        const pelletGeo = new THREE.SphereGeometry(1.5, 6, 6);
        const powerGeo = new THREE.SphereGeometry(3.5, 8, 8);

        const offsetX = (this.mapW * TILE_SIZE) / 2;
        const offsetZ = (this.mapH * TILE_SIZE) / 2;

        for (let row = 0; row < this.mapH; row++) {
            for (let col = 0; col < this.mapW; col++) {
                const val = gridLayout[row][col];
                
                const x = col * TILE_SIZE - offsetX + (TILE_SIZE/2);
                const z = row * TILE_SIZE - offsetZ + (TILE_SIZE/2);

                if (val === 1) {
                    const joint = new THREE.Mesh(jointGeo, wallMat);
                    joint.position.set(x, 0, z);
                    this.scene.add(joint);
                    this.walls.push(joint);

                    if (col < this.mapW - 1 && gridLayout[row][col + 1] === 1) {
                        const conn = new THREE.Mesh(hConnGeo, wallMat);
                        conn.position.set(x + TILE_SIZE/2, 0, z); 
                        this.scene.add(conn);
                        this.walls.push(conn);
                    }
                    if (row < this.mapH - 1 && gridLayout[row + 1][col] === 1) {
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
        }
        
        this.floor.geometry.dispose();
        this.floor.geometry = new THREE.PlaneGeometry(this.mapW * TILE_SIZE + 100, this.mapH * TILE_SIZE + 100);
        
        this.updateCamera();
    }

    setupInput() {
        this.keys = {};
        window.addEventListener('keydown', (e) => {
            if (this.optionsOpen) return; 
            this.resetIdleTimer();
            
            if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
            this.keys[e.key] = true;

            if(this.state === 'MENU') {
                if(e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'w' || e.key === 's') {
                    this.twoPlayerMode = !this.twoPlayerMode;
                    this.updateMenuUI();
                }
                if(e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'a' || e.key === 'd') {
                     if(this.mapStyle === 'ORIGINAL') this.mapStyle = 'RANDOM';
                     else if(this.mapStyle === 'RANDOM') this.mapStyle = 'CUSTOM';
                     else this.mapStyle = 'ORIGINAL';
                     
                     let desc = this.mapStyle;
                     if(this.mapStyle === 'CUSTOM') desc += ` (${this.customConfig.width}x${this.customConfig.height})`;
                     this.ui.subText.innerText = `MAP: ${desc}`;
                }
                if(e.key.toLowerCase() === 'o') {
                    this.toggleOptions();
                }
                if(e.key === ' ' || e.key === 'Enter') this.startGame(false);
            }
            if(this.state === 'GAMEOVER' && (e.key === ' ' || e.key === 'Enter')) {
                this.resetGame();
            }
        });
        window.addEventListener('keyup', (e) => this.keys[e.key] = false);

        this.ui.btn1p.addEventListener('click', () => { this.twoPlayerMode = false; this.updateMenuUI(); });
        this.ui.btn2p.addEventListener('click', () => { this.twoPlayerMode = true; this.updateMenuUI(); });
        this.ui.btnStart.addEventListener('click', () => { this.startGame(false); });
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
        if(this.state !== 'MENU' || this.optionsOpen) return;
        
        const idleTime = (Date.now() - this.lastInputTime) / 1000;
        const timeLeft = Math.ceil(4.0 - idleTime);

        if (timeLeft <= 3 && timeLeft > 0) {
            this.ui.demoText.classList.remove('hidden');
            this.ui.demoText.innerText = `DEMO IN ${timeLeft}`;
        } else if (timeLeft > 3) {
            this.ui.demoText.classList.add('hidden');
        }

        if (idleTime >= 4.0) {
            this.startGame(true); 
        }
    }

    createActors() {
        this.actors.forEach(a => this.scene.remove(a.mesh));
        this.players = [];
        this.ghosts = [];
        this.actors = [];

        const p1 = new GhostMan(this, 1, 0xffff00);
        this.players.push(p1);

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
        
        let desc = this.mapStyle;
        if(this.mapStyle === 'CUSTOM') desc += ` (${this.customConfig.width}x${this.customConfig.height})`;
        this.ui.subText.innerText = `MAP: ${desc}`;
        
        this.ui.subText.style.display = "block";
        this.ui.demoText.classList.add('hidden');
        document.getElementById('mode-select').style.display = "flex";
        this.ui.btnStart.style.display = 'inline-block';
        this.level = 1;
        this.lastInputTime = Date.now();
        
        this.gamepadMap = {};
        this.activeGamepads.clear();
        this.twoPlayerMode = false;
        this.updateMenuUI();
    }

    startGame(isDemo = false) {
        if(this.optionsOpen) return;
        this.isDemo = isDemo;
        this.state = isDemo ? 'DEMO' : 'PLAYING';
        
        if(!isDemo) this.audio.tryInit();
        this.ui.title.style.display = 'none';

        if(this.mapStyle !== 'ORIGINAL' || this.level === 1) this.buildMaze();

        this.createActors();
        this.resetLevel();
        
        if(!isDemo) this.audio.playIntro();
        
        this.players.forEach(p => {
            p.score = 0;
            p.lives = 3;
            p.updateUI();
            if(isDemo) p.speed = SPEED_DEMO_BOT;
        });

        if (isDemo) {
            this.ui.mainText.innerText = "DEMO MODE";
            this.ui.subText.innerText = "PRESS ANY KEY";
            this.ui.title.style.display = 'block';
            this.ui.title.style.background = 'transparent';
            this.ui.title.style.border = 'none';
            this.ui.title.style.boxShadow = 'none';
            this.ui.btnStart.style.display = 'none';
            setTimeout(() => { 
                if(this.state === 'DEMO') this.ui.title.style.display = 'none'; 
            }, 2000);
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
        this.ui.btnStart.style.display = 'none';

        if (!this.isDemo) {
            setTimeout(() => {
                if(this.state !== 'GAMEOVER') {
                    this.ui.title.style.display = 'none';
                    this.ui.title.style.background = 'rgba(0,0,0,0.9)';
                    this.ui.title.style.border = '4px double var(--neon-blue)';
                    this.ui.title.style.boxShadow = '0 0 20px var(--neon-blue)';
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
        if(this.state === 'DEMO') {
             this.resetGame();
             return;
        }
        this.state = 'READY';
        setTimeout(() => {
            this.level++;
            if(this.mapStyle !== 'ORIGINAL') this.buildMaze();
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
        this.ui.btnStart.style.display = 'none';
    }

    isWalkable(c, r, isGhost = false) {
        if (r < 0 || r >= this.mapH || c < 0 || c >= this.mapW) {
            // Check for Tunnel row (approx 45% down)
            const tunnelY = Math.floor(this.mapH * 0.45);
            if (r === tunnelY) return true; 
            if (this.mapStyle === 'ORIGINAL' && r === 13) return true;
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
        const offsetX = (this.mapW * TILE_SIZE) / 2;
        const offsetZ = (this.mapH * TILE_SIZE) / 2;
        return {
            x: col * TILE_SIZE - offsetX + (TILE_SIZE/2),
            z: row * TILE_SIZE - offsetZ + (TILE_SIZE/2)
        };
    }
}

new Game();
