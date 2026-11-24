(function() {
    const canvasWrap = document.querySelector('#game-canvas-wrap');
    const hudHealth = document.querySelector('#hud-health');
    const hudAmmo = document.querySelector('#hud-ammo');
    const hudEnemies = document.querySelector('#hud-enemies');
    const startOverlay = document.querySelector('#start-overlay');
    const winOverlay = document.querySelector('#win-overlay');
    const gameoverOverlay = document.querySelector('#gameover-overlay');
    const btnStart = document.querySelector('#btn-start');
    const btnRestartWin = document.querySelector('#btn-restart-win');
    const btnRestartLoss = document.querySelector('#btn-restart-loss');
    const btnReload = document.querySelector('#btn-reload-weapon');

    let scene, camera, renderer, audio, colliders = [];
    let player = {
        hp: 100,
        ammo: 30,
        reserve: 90,
        pos: new THREE.Vector3(0, 1.7, 10),
        vel: new THREE.Vector3(),
        yaw: 0,
        pitch: 0,
        isReloading: false,
        radius: 0.6
    };

    let enemies = [];
    let enemiesRemaining = 6;
    let gameActive = false;
    let keys = {};
    let isMouseDown = false;
    let weaponGroup, muzzleFlash, weaponRecoil = 0;
    let lastEnemyFire = 0;

    // Extend GameWorld with missing builders if they weren't finished in snippet
    if (!window.GameWorld.createPlayerWeapon) {
        window.GameWorld.createPlayerWeapon = function(cam) {
            const group = new THREE.Group();
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.5), new THREE.MeshPhongMaterial({ color: 0x222222 }));
            body.position.set(0.2, -0.25, -0.4);
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4), new THREE.MeshPhongMaterial({ color: 0x111111 }));
            barrel.rotation.x = Math.PI / 2;
            barrel.position.set(0.2, -0.2, -0.7);
            const mag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.08), new THREE.MeshPhongMaterial({ color: 0x111111 }));
            mag.position.set(0.2, -0.35, -0.45);
            
            const flash = new THREE.Sprite(new THREE.SpriteMaterial({ 
                map: new THREE.CanvasTexture((() => {
                    const c = document.createElement('canvas'); c.width=64; c.height=64;
                    const ctx = c.getContext('2d');
                    const grad = ctx.createRadialGradient(32,32,0,32,32,32);
                    grad.addColorStop(0, 'white'); grad.addColorStop(0.4, 'yellow'); grad.addColorStop(1, 'transparent');
                    ctx.fillStyle = grad; ctx.fillRect(0,0,64,64); return c;
                })()),
                transparent: true, opacity: 0.8
            }));
            flash.scale.set(0.3, 0.3, 0.3);
            flash.position.set(0.2, -0.2, -0.9);
            flash.visible = false;

            group.add(body, barrel, mag, flash);
            cam.add(group);
            return { group, flash };
        };
    }

    if (!window.GameWorld.createEnemySoldier) {
        window.GameWorld.createEnemySoldier = function(scene, x, z) {
            const group = new THREE.Group();
            const mat = new THREE.MeshLambertMaterial({ color: 0x334433 });
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshLambertMaterial({ color: 0xddaa88 }));
            head.position.y = 1.6;
            const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.45), new THREE.MeshLambertMaterial({ color: 0x223322 }));
            helmet.position.y = 1.75;
            const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.3), mat);
            torso.position.y = 1.1;
            const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), mat);
            lLeg.position.set(-0.15, 0.35, 0);
            const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), mat);
            rLeg.position.set(0.15, 0.35, 0);
            
            group.add(head, helmet, torso, lLeg, rLeg);
            group.position.set(x, 0, z);
            scene.add(group);

            const hpBar = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff0000 }));
            hpBar.scale.set(0.8, 0.1, 1);
            hpBar.position.y = 2.1;
            group.add(hpBar);

            return {
                group, lLeg, rLeg, hpBar,
                hp: 100,
                lastShot: 0,
                state: 'patrol',
                targetPos: new THREE.Vector3(x + (Math.random()-0.5)*10, 0, z + (Math.random()-0.5)*10)
            };
        };
    }

    function init() {
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x050505);
        renderer.shadowMap.enabled = true;
        canvasWrap.appendChild(renderer.domElement);

        colliders = window.GameWorld.buildEnvironment(scene);
        const weaponData = window.GameWorld.createPlayerWeapon(camera);
        weaponGroup = weaponData.group;
        muzzleFlash = weaponData.flash;

        for (let i = 0; i < 6; i++) {
            const ang = (i / 6) * Math.PI * 2;
            enemies.push(window.GameWorld.createEnemySoldier(scene, Math.cos(ang) * 25, Math.sin(ang) * 25));
        }

        window.addEventListener('resize', onWindowResize);
        document.addEventListener('keydown', (e) => keys[e.code] = true);
        document.addEventListener('keyup', (e) => keys[e.code] = false);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mousedown', () => { isMouseDown = true; if(gameActive) shoot(); });
        document.addEventListener('mouseup', () => isMouseDown = false);
        
        btnStart.onclick = startGame;
        btnRestartWin.onclick = () => location.reload();
        btnRestartLoss.onclick = () => location.reload();
        btnReload.onclick = reload;

        // Touch support
        document.querySelector('#touch-fire').addEventListener('touchstart', (e) => { e.preventDefault(); shoot(); });
        const touchForward = document.querySelector('#touch-forward');
        touchForward.addEventListener('touchstart', (e) => { e.preventDefault(); keys['KeyW'] = true; });
        touchForward.addEventListener('touchend', (e) => { e.preventDefault(); keys['KeyW'] = false; });
    }

    function startGame() {
        audio = window.GameWorld.initAudio();
        startOverlay.style.display = 'none';
        gameActive = true;
        renderer.domElement.requestPointerLock();
        animate();
    }

    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function onMouseMove(e) {
        if (!gameActive) return;
        const sensitivity = 0.002;
        const movementX = e.movementX || 0;
        const movementY = e.movementY || 0;

        player.yaw -= movementX * sensitivity;
        player.pitch -= movementY * sensitivity;
        player.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, player.pitch));
    }

    function checkCollision(nx, nz) {
        for (let c of colliders) {
            if (nx + player.radius > c.minX && nx - player.radius < c.maxX &&
                nz + player.radius > c.minZ && nz - player.radius < c.maxZ) return true;
        }
        return false;
    }

    function shoot() {
        if (player.isReloading || player.ammo <= 0 || !gameActive) return;
        
        player.ammo--;
        weaponRecoil = 0.15;
        muzzleFlash.visible = true;
        setTimeout(() => muzzleFlash.visible = false, 50);
        audio.playShoot();

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const intersects = raycaster.intersectObjects(enemies.map(e => e.group), true);

        if (intersects.length > 0) {
            let hitObj = intersects[0].object;
            while(hitObj.parent && !hitObj.enemyRef) {
                if (enemies.find(e => e.group === hitObj)) { hitObj.enemyRef = enemies.find(e => e.group === hitObj); break; }
                hitObj = hitObj.parent;
            }
            const enemy = hitObj.enemyRef;
            if (enemy) {
                enemy.hp -= 35;
                audio.playHit();
                enemy.hpBar.scale.x = Math.max(0, enemy.hp / 100) * 0.8;
                if (enemy.hp <= 0) {
                    scene.remove(enemy.group);
                    enemies = enemies.filter(e => e !== enemy);
                    enemiesRemaining--;
                    if (enemiesRemaining <= 0) winGame();
                }
            }
        }
        updateUI();
    }

    function reload() {
        if (player.isReloading || player.reserve <= 0 || player.ammo === 30) return;
        player.isReloading = true;
        setTimeout(() => {
            const needed = 30 - player.ammo;
            const take = Math.min(needed, player.reserve);
            player.ammo += take;
            player.reserve -= take;
            player.isReloading = false;
            updateUI();
        }, 2000);
    }

    function updateUI() {
        hudHealth.innerText = `HP: ${Math.ceil(player.hp)}`;
        hudAmmo.innerText = `AMMO: ${player.ammo} / ${player.reserve}`;
        hudEnemies.innerText = `ENEMIES: ${enemiesRemaining}`;
    }

    function winGame() {
        gameActive = false;
        document.exitPointerLock();
        winOverlay.style.display = 'flex';
        audio.playWin();
    }

    function gameOver() {
        gameActive = false;
        document.exitPointerLock();
        gameoverOverlay.style.display = 'flex';
    }

    function animate() {
        if (!gameActive) return;
        requestAnimationFrame(animate);

        // Movement
        const speed = keys['ShiftLeft'] ? 0.25 : 0.15;
        const dir = new THREE.Vector3();
        if (keys['KeyW'] || keys['ArrowUp']) dir.z -= 1;
        if (keys['KeyS'] || keys['ArrowDown']) dir.z += 1;
        if (keys['KeyA'] || keys['ArrowLeft']) dir.x -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) dir.x += 1;
        dir.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw);

        const nextX = player.pos.x + dir.x * speed;
        const nextZ = player.pos.z + dir.z * speed;

        if (!checkCollision(nextX, player.pos.z)) player.pos.x = nextX;
        if (!checkCollision(player.pos.x, nextZ)) player.pos.z = nextZ;

        camera.position.copy(player.pos);
        camera.rotation.order = 'YXZ';
        camera.rotation.y = player.yaw;
        camera.rotation.x = player.pitch;

        // Weapon Recoil Lerp
        weaponGroup.position.z = THREE.MathUtils.lerp(weaponGroup.position.z, weaponRecoil, 0.2);
        weaponRecoil = THREE.MathUtils.lerp(weaponRecoil, 0, 0.1);

        // Enemies AI
        const time = Date.now() * 0.001;
        enemies.forEach(en => {
            const dist = en.group.position.distanceTo(player.pos);
            en.group.lookAt(player.pos.x, 0, player.pos.z);
            
            // Leg animation
            const walkCycle = Math.sin(time * 10) * 0.5;
            en.lLeg.rotation.x = walkCycle;
            en.rLeg.rotation.x = -walkCycle;

            if (dist < 20) {
                if (time - en.lastShot > 1.5) {
                    en.lastShot = time;
                    fireTracer(en.group.position, player.pos);
                    player.hp -= 8;
                    audio.playHit();
                    updateUI();
                    if (player.hp <= 0) gameOver();
                }
            } else {
                en.group.translateZ(0.05);
            }
        });

        if (keys['KeyR']) reload();
        if (keys['KeyF']) shoot();

        renderer.render(scene, camera);
    }

    function fireTracer(from, to) {
        const points = [from.clone().add(new THREE.Vector3(0, 1.2, 0)), to.clone().add(new THREE.Vector3(0, -0.2, 0))];
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color: 0xffff00 });
        const line = new THREE.Line(geo, mat);
        scene.add(line);
        setTimeout(() => {
            scene.remove(line);
            geo.dispose();
            mat.dispose();
        }, 100);
    }

    init();
})();