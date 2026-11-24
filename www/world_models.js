window.GameWorld = {
    initAudio: function() {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        const playTone = (freq, type, duration, volume, decay) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            gain.gain.setValueAtTime(volume, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + duration);
        };

        const playNoise = (duration, volume, lowPassFreq) => {
            const bufferSize = audioCtx.sampleRate * duration;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const noise = audioCtx.createBufferSource();
            noise.buffer = buffer;
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(lowPassFreq, audioCtx.currentTime);
            const gain = audioCtx.createGain();
            gain.gain.setValueAtTime(volume, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(audioCtx.destination);
            noise.start();
        };

        return {
            playShoot: () => {
                playTone(150, 'square', 0.1, 0.2);
                playNoise(0.1, 0.3, 1000);
            },
            playHit: () => {
                playTone(80, 'sine', 0.2, 0.4);
            },
            playExplosion: () => {
                playNoise(1.5, 0.8, 400);
                playTone(60, 'sawtooth', 0.5, 0.5);
            },
            playWin: () => {
                [261, 329, 392, 523].forEach((f, i) => {
                    setTimeout(() => playTone(f, 'triangle', 0.5, 0.3), i * 150);
                });
            }
        };
    },

    buildEnvironment: function(scene) {
        const colliders = [];

        const createTexture = (color1, color2, size = 64) => {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = color1;
            ctx.fillRect(0, 0, size, size);
            ctx.fillStyle = color2;
            ctx.globalAlpha = 0.2;
            for(let i=0; i<20; i++) {
                ctx.fillRect(Math.random()*size, Math.random()*size, size/4, size/4);
            }
            const tex = new THREE.CanvasTexture(canvas);
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            return tex;
        };

        const groundTex = createTexture('#2a2e21', '#1a1c14');
        groundTex.repeat.set(50, 50);
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(500, 500),
            new THREE.MeshLambertMaterial({ map: groundTex })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        const sky = new THREE.Mesh(
            new THREE.SphereGeometry(400, 32, 32),
            new THREE.MeshBasicMaterial({ color: 0x111122, side: THREE.BackSide })
        );
        scene.add(sky);

        const light = new THREE.DirectionalLight(0xffffff, 0.8);
        light.position.set(50, 100, 50);
        scene.add(light);
        scene.add(new THREE.AmbientLight(0x404040, 0.5));

        const addBox = (x, y, z, w, h, d, color, isStatic = true) => {
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(w, h, d),
                new THREE.MeshLambertMaterial({ color: color })
            );
            mesh.position.set(x, y + h / 2, z);
            scene.add(mesh);
            if (isStatic) {
                colliders.push({
                    minX: x - w / 2, maxX: x + w / 2,
                    minZ: z - d / 2, maxZ: z + d / 2
                });
            }
            return mesh;
        };

        // Bunkers
        for (let i = 0; i < 2; i++) {
            const bx = i === 0 ? -40 : 40;
            const bz = -30;
            addBox(bx, 0, bz, 15, 6, 15, 0x555555); // Main
            addBox(bx, 6, bz, 16, 1, 16, 0x444444); // Roof
        }

        // Watchtower
        const tx = 0, tz = -60;
        addBox(tx - 2, 0, tz - 2, 0.5, 15, 0.5, 0x222222);
        addBox(tx + 2, 0, tz - 2, 0.5, 15, 0.5, 0x222222);
        addBox(tx - 2, 0, tz + 2, 0.5, 15, 0.5, 0x222222);
        addBox(tx + 2, 0, tz + 2, 0.5, 15, 0.5, 0x222222);
        addBox(tx, 15, tz, 6, 0.5, 6, 0x333333); // Platform
        addBox(tx, 18, tz, 6, 0.5, 6, 0x333333); // Tower Roof

        // Containers
        const colors = [0x992222, 0x222299, 0x227722];
        for (let i = 0; i < 5; i++) {
            addBox(-60 + (i * 12), 0, 20, 10, 5, 5, colors[i % 3]);
        }

        // Crates
        const crateTex = createTexture('#8b4513', '#5d2e0c');
        for (let i = 0; i < 10; i++) {
            const cx = Math.random() * 100 - 50;
            const cz = Math.random() * 100 - 50;
            if (Math.abs(cx) > 10 || Math.abs(cz) > 10) {
                const crate = addBox(cx, 0, cz, 2, 2, 2, 0xffffff);
                crate.material.map = crateTex;
            }
        }

        return colliders;
    },

    createPlayerWeapon: function(camera) {
        const weaponGroup = new THREE.Group();
        const matBlack = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 50 });
        const matGrey = new THREE.MeshPhongMaterial({ color: 0x333333, shininess: 30 });

        // Receiver
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.6), matBlack);
        weaponGroup.add(body);

        // Barrel
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8), matGrey);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.z = -0.6;
        weaponGroup.add(barrel);

        // Scope
        const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3), matBlack);
        scope.rotation.x = Math.PI / 2;
        scope.position.y = 0.15;
        scope.position.z = -0.1;
        weaponGroup.add(scope);

        // Grip
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.1), matBlack);
        grip.position.y = -0.2;
        grip.position.z = 0.1;
        grip.rotation.x = -0.2;
        weaponGroup.add(grip);

        // Magazine
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.15), matGrey);
        mag.position.y = -0.25;
        mag.position.z = -0.2;
        mag.rotation.x = 0.1;
        weaponGroup.add(mag);

        // Muzzle Flash
        const flashGeom = new THREE.SphereGeometry(0.1, 8, 8);
        const flashMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.8 });
        const muzzleFlash = new THREE.Mesh(flashGeom, flashMat);
        muzzleFlash.position.z = -1.0;
        muzzleFlash.visible = false;
        weaponGroup.add(muzzleFlash);

        weaponGroup.position.set(0.3, -0.4, -0.6);
        camera.add(weaponGroup);

        return { weaponGroup, muzzleFlash };
    },

    createEnemySoldier: function(scene, x, z) {
        const group = new THREE.Group();
        const matCamo = new THREE.MeshLambertMaterial({ color: 0x4b5320 });
        const matSkin = new THREE.MeshLambertMaterial({ color: 0xd2b48c });
        const matVest = new THREE.MeshLambertMaterial({ color: 0x222222 });
        const matBlack = new THREE.MeshLambertMaterial({ color: 0x000000 });

        // Legs
        const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1, 0.4), matCamo);
        leftLeg.position.set(-0.3, 0.5, 0);
        group.add(leftLeg);

        const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1, 0.4), matCamo);
        rightLeg.position.set(0.3, 0.5, 0);
        group.add(rightLeg);

        // Torso
        const torso = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 0.5), matCamo);
        torso.position.y = 1.6;
        group.add(torso);

        // Tactical Vest
        const vest = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 0.6), matVest);
        vest.position.y = 1.7;
        group.add(vest);

        // Head
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), matSkin);
        head.position.y = 2.4;
        group.add(head);

        // Helmet
        const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.5), matBlack);
        helmet.position.y = 2.6;
        group.add(helmet);

        // Arms & Rifle
        const armGroup = new THREE.Group();
        armGroup.position.y = 1.8;
        
        const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.3), matCamo);
        leftArm.position.set(-0.6, 0, 0.2);
        leftArm.rotation.x = -Math.PI/4;
        armGroup.add(leftArm);

        const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.3), matCamo);
        rightArm.position.set(0.6, 0, 0.2);
        rightArm.rotation.x = -Math.PI/4;
        armGroup.add(rightArm);

        const eRifle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 1.2), matBlack);
        eRifle.position.set(0, 0, 0.6);
        armGroup.add(eRifle);
        
        group.add(armGroup);

        // Health Bar Sprite
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 8;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(0, 0, 64, 8);
        const hpTex = new THREE.CanvasTexture(canvas);
        const hpMat = new THREE.SpriteMaterial({ map: hpTex });
        const hpSprite = new THREE.Sprite(hpMat);
        hpSprite.position.y = 3.0;
        hpSprite.scale.set(1.5, 0.2, 1);
        group.add(hpSprite);

        group.position.set(x, 0, z);
        scene.add(group);

        const enemyObj = {
            mesh: group,
            health: 100,
            maxHealth: 100,
            leftLeg: leftLeg,
            rightLeg: rightLeg,
            hpSprite: hpSprite,
            alive: true,
            updateHealth: function() {
                const pct = Math.max(0, this.health / this.maxHealth);
                ctx.fillStyle = '#330000';
                ctx.fillRect(0, 0, 64, 8);
                ctx.fillStyle = '#ff0000';
                ctx.fillRect(0, 0, 64 * pct, 8);
                hpTex.needsUpdate = true;
            }
        };

        return enemyObj;
    }
};