
/* ---- Inline script section 1 ---- */

        // Sample Video Sources
        const SAMPLES = {
            sample1: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
            sample2: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4'
        };

        // Simulator State
        const state = {
            aspectRatio: 1.43,   // 1.43:1 (IMAX GT) or 1.90:1 (Digital)
            curvature: 0.35,     // Viewer-relative: concave center farther away, edges wrap toward seats
            sideWallIntensity: 0.35,
            scale: 1.0,          // Screen scale multiplier
            fov: 65,             // Camera Field of View
            lightIntensity: 0.8, // Dynamic light intensity multiplier
            themeMode: 'dark',   // 'dark' or 'glow'
            curDistance: 22,     // Camera Z distance
            seatEyeY: -0.8,      // Eye height follows the selected auditorium row
            seatX: 0,
            selectedSeatNo: null,
            seatPreset: 'center',
            screenX: false,
            screenShape: 'concave',
            quality: 'medium',

            // Advanced Depth & Cinematic FX Extensions
            depthMode: 'parallax', // 'off', 'parallax', 'depthMap', 'aiVideoDepth'
            depthStrength: 0.45,
            glowEnabled: true,
            edgeFit: false
        };

        // Three.js Core Variables
        let scene, camera, renderer, controls;
        let screenMesh, screenGeometry, screenMaterial, screenFrameMesh;
        let backWallMesh = null, backWallGeometry = null;
        let screenXGroup, screenXMaterials = [];
        let wallGlowLeft, wallGlowRight, aisleLights = [];
        let frameCounter = 0;
        let currentObjectUrl = null;
        let videoTexture, ambientLight, spotLight, overheadLight;
        let cinemaPlayingMode = false;
        let theaterRoom, wallMaterial, floorMaterial;
        let preFitCamera = null;

        // Visual Effects Objects
        let screenRimGlowMesh = null;
        let depthDataArray = null;
        let depthAnalysisTarget = null;
        let lastDepthAnalysisTime = 0;

        // Video & Canvas Elements
        const video = document.getElementById('imax-video');
        const analysisCanvas = document.getElementById('analysis-canvas');
        const analysisCtx = analysisCanvas.getContext('2d', { willReadFrequently: true });
        const depthCanvas = document.getElementById('depth-canvas');
        const depthCtx = depthCanvas.getContext('2d', { willReadFrequently: true });

        // DOM Elements
        const container = document.getElementById('canvas-container');
        const btnPlay = document.getElementById('btn-play');
        const btnMute = document.getElementById('btn-mute');
        const seekBar = document.getElementById('seek-bar');
        const volumeBar = document.getElementById('volume-bar');
        const timeCurrent = document.getElementById('time-current');
        const timeTotal = document.getElementById('time-total');
        const videoFileInput = document.getElementById('video-file-input');
        let aiDepthPipelinePromise = null;
        let precomputedVideoDepthFrames = [];
        let videoDepthAnalysisReady = false;
        let videoDepthAnalysisInProgress = false;
        let videoDepthAnalysisCancelled = false;
        let currentAppliedDepthFrameIndex = -1;

        function applyPrecomputedVideoDepth() {
            if (state.depthMode !== 'aiVideoDepth' || !videoDepthAnalysisReady || !precomputedVideoDepthFrames.length) return;
            const t = Number.isFinite(video.currentTime) ? video.currentTime : 0;
            let bestIndex = 0;
            let bestDistance = Math.abs(precomputedVideoDepthFrames[0].time - t);
            for (let i = 1; i < precomputedVideoDepthFrames.length; i++) {
                const distance = Math.abs(precomputedVideoDepthFrames[i].time - t);
                if (distance < bestDistance) { bestIndex = i; bestDistance = distance; }
            }
            if (bestIndex !== currentAppliedDepthFrameIndex) {
                currentAppliedDepthFrameIndex = bestIndex;
                depthDataArray = precomputedVideoDepthFrames[bestIndex].data;
                updateDepthMeshDisplacement();
            }
        }
        const controlsPanel = document.getElementById('controls-panel');

        // Persisted user settings are restored before building the scene.
        restoreSavedSettings();

        // Initialize Application
        window.addEventListener('DOMContentLoaded', () => {
            syncSettingsUI();
            initThreeJS();
            initTheaterEnvironment();
            syncThemeUI();
            createIMAXScreen();
            initCinematicEffects();
            initVideoPlayer();
            setupUIEventListeners();
            setScreenXMode(state.screenX);
            applyGraphicsQuality();
            animate();
        });
        // --- 1. Three.js Scene Setup ---
        function initThreeJS() {
            scene = new THREE.Scene();
            scene.fog = new THREE.FogExp2(0x05070c, 0.018);

            // Camera setup
            camera = new THREE.PerspectiveCamera(state.fov, window.innerWidth / window.innerHeight, 0.1, 200);
            camera.position.set(state.seatX || 0, state.seatEyeY, state.curDistance);

            // Renderer setup
            renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
            renderer.setSize(window.innerWidth, window.innerHeight);
            const isMobileDevice = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || window.innerWidth < 700;
            renderer.setPixelRatio(getQualityPixelRatio(isMobileDevice));
            renderer.outputEncoding = THREE.sRGBEncoding;
            renderer.physicallyCorrectLights = false;
            renderer.shadowMap.enabled = !isMobileDevice && state.quality === 'high';
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 1.1;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            container.appendChild(renderer.domElement);

            // OrbitControls for interactive viewing angle
            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            controls.maxPolarAngle = Math.PI / 2 + 0.05; // Prevent going beneath floor
            controls.minDistance = 8;
            controls.maxDistance = 27;
            controls.enablePan = false; // Keep the viewing target inside the auditorium
            controls.target.set(0, 5, 0);
            controls.addEventListener('change', () => {
                // Constrain the camera to the inside of the room (room bounds: x ±26, y -5..15, z about -3..26).
                camera.position.x = THREE.MathUtils.clamp(camera.position.x, -24.5, 24.5);
                camera.position.y = THREE.MathUtils.clamp(camera.position.y, -4.5, 14.5);
                camera.position.z = THREE.MathUtils.clamp(camera.position.z, -2.5, 25.5);
                controls.target.x = THREE.MathUtils.clamp(controls.target.x, -22, 22);
                controls.target.y = THREE.MathUtils.clamp(controls.target.y, -3.5, 13.5);
                controls.target.z = THREE.MathUtils.clamp(controls.target.z, -1.5, 24.5);
                updateDepthMeshDisplacement();
            });

            // Resize listener
            window.addEventListener('resize', onWindowResize);
            window.addEventListener('orientationchange', () => setTimeout(onWindowResize, 150));
        }

        // --- 2. Theater Room Geometry & Lighting ---
        function initTheaterEnvironment() {
            // Luxury auditorium fitted around the unchanged IMAX / ScreenX geometry.
            ambientLight = new THREE.AmbientLight(0xb9bec6, 1.05);
            scene.add(ambientLight);

            spotLight = new THREE.PointLight(0x91a0b7, 0.72, 32, 1.8);
            spotLight.position.set(0, 5, 2);
            scene.add(spotLight);

            overheadLight = new THREE.DirectionalLight(0xd4c9b8, 0.78);
            overheadLight.position.set(0, 22, 10);
            scene.add(overheadLight);

            wallMaterial = new THREE.MeshStandardMaterial({
                color: 0x191a1d, roughness: 0.94, metalness: 0.025
            });
            floorMaterial = new THREE.MeshStandardMaterial({
                color: 0x181819, roughness: 1.0, metalness: 0.0
            });

            // Keep enough width for the existing ScreenX panels at their widest setting.
            // The original screen and ScreenX geometry are deliberately not edited.
            const roomWidth = 52;
            const roomHeight = 20;
            const roomDepth = 62;
            // Extend floor and ceiling behind the bowed back wall so they meet it without a gap.
            const roomCenterZ = 23.0;

            // One continuous floor-to-ceiling curved BACK wall, kept behind the screen frame.
            // Side-wall junctions move forward by half the 5.85-unit gap (2.925 units).
            // The center of the back wall bows away from the seating area, behind the frame.
            const backWallJunctionZ = -3.075;
            backWallGeometry = new THREE.PlaneGeometry(roomWidth, roomHeight, 80, 1);
            backWallGeometry.computeVertexNormals();
            const backWallMat = wallMaterial.clone();
            backWallMat.side = THREE.DoubleSide;
            backWallMesh = new THREE.Mesh(backWallGeometry, backWallMat);
            backWallMesh.position.set(0, roomHeight / 2 - 5, backWallJunctionZ);
            scene.add(backWallMesh);
            updateBackWallCurvature();

            const floor = new THREE.Mesh(new THREE.PlaneGeometry(roomWidth, roomDepth),
                new THREE.MeshStandardMaterial({ color: 0x19191b, roughness: 1.0, metalness: 0.0 }));
            floor.rotation.x = -Math.PI / 2;
            floor.position.set(0, -5, roomCenterZ);
            floor.receiveShadow = true;
            scene.add(floor);

            // Side walls begin at the curved back wall's endpoints. The front part of
            // each side wall is cut back by 2.925 units; the first window begins at z=-0.15.
            // The screen/frame at z=-6 remains inside the room, in front of the bowed wall center.
            const frameBackZ = -3.075;
            const sideWallFrontZ = frameBackZ;
            const sideEndZ = 26.0;
            const sideWallLength = sideEndZ - sideWallFrontZ;
            const sideWallCenterZ = (sideEndZ + sideWallFrontZ) / 2;
            const sideWallMat = wallMaterial.clone();
            sideWallMat.side = THREE.DoubleSide;
            const sideWallGeo = new THREE.PlaneGeometry(sideWallLength, roomHeight);
            for (const side of [-1, 1]) {
                const sideWall = new THREE.Mesh(sideWallGeo, sideWallMat);
                sideWall.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
                sideWall.position.set(side * roomWidth / 2, roomHeight / 2 - 5, sideWallCenterZ);
                scene.add(sideWall);
            }

            // Close the auditorium at the REAR, behind the seating rows.
            // The curved wall near z=-3.075 is the screen/front wall; this is the opposite wall.
            const rearWallMat = wallMaterial.clone();
            rearWallMat.side = THREE.DoubleSide;
            const rearWall = new THREE.Mesh(
                new THREE.PlaneGeometry(roomWidth, roomHeight),
                rearWallMat
            );
            rearWall.position.set(0, roomHeight / 2 - 5, sideEndZ);
            scene.add(rearWall);

            const acousticMat = new THREE.MeshStandardMaterial({ color: 0x242528, roughness: 0.97, metalness: 0.015 });
            const insetMat = new THREE.MeshStandardMaterial({ color: 0x101113, roughness: 0.94, metalness: 0.02 });
            const trimMat = new THREE.MeshStandardMaterial({ color: 0x37383a, roughness: 0.48, metalness: 0.38 });
            const accentMat = new THREE.MeshBasicMaterial({ color: 0x8b6749, toneMapped: false });
            const guidanceMat = new THREE.MeshBasicMaterial({ color: 0xffb16b, toneMapped: false });
            const speakerMat = new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 0.66, metalness: 0.1 });
            const speakerConeMat = new THREE.MeshStandardMaterial({ color: 0x292b2e, roughness: 0.8, metalness: 0.04 });

            // Side-wall panels are set back from the room boundary to keep ScreenX surfaces clear.
            for (const side of [-1, 1]) {
                for (let i = 0; i < 9; i++) {
                    const z = 1.5 + i * 5.5;
                    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.13, 10.5, 3.3), acousticMat);
                    panel.position.set(side * 25.45, 6.2, z);
                    scene.add(panel);

                    const inset = new THREE.Mesh(new THREE.BoxGeometry(0.035, 8.4, 2.55), insetMat);
                    inset.position.set(side * 25.36, 6.2, z);
                    scene.add(inset);

                    const verticalAccent = new THREE.Mesh(new THREE.BoxGeometry(0.035, 7.6, 0.045), accentMat);
                    verticalAccent.position.set(side * 25.30, 6.2, z - 1.30);
                    scene.add(verticalAccent);
                }

                // Compact flush surround speakers sit behind/within panel zones, away from screen projection.
                for (const z of [5.5, 16.5, 27.5, 38.5, 49.5]) {
                    const speaker = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.25, 0.82), speakerMat);
                    speaker.position.set(side * 25.30, 3.7, z);
                    scene.add(speaker);
                    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.04, 14), speakerConeMat);
                    cone.rotation.z = Math.PI / 2;
                    cone.position.set(side * 25.18, 3.7, z);
                    scene.add(cone);
                }

                const lowGuidance = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.045, 48), guidanceMat);
                lowGuidance.position.set(side * 24.95, -4.86, 25);
                scene.add(lowGuidance);
            }

            // Extra surround geometry outside the rectangular screen frame removed.

            // Ceiling: restrained dark acoustic slats and low-glare recessed fixture details.
            const ceilingMat = new THREE.MeshStandardMaterial({
                color: 0x111214, roughness: 0.96, metalness: 0.02, side: THREE.DoubleSide
            });
            const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(roomWidth, roomDepth), ceilingMat);
            ceiling.rotation.x = Math.PI / 2;
            ceiling.position.set(0, 15, roomCenterZ);
            scene.add(ceiling);

            const ceilingRibMat = new THREE.MeshStandardMaterial({ color: 0x252629, roughness: 0.88, metalness: 0.06 });
            for (let z = -1; z < 53; z += 5.5) {
                const slat = new THREE.Mesh(new THREE.BoxGeometry(46, 0.14, 0.22), ceilingRibMat);
                slat.position.set(0, 14.82, z);
                scene.add(slat);
            }
            const downlightMat = new THREE.MeshBasicMaterial({ color: 0x81725f, toneMapped: false });
            for (const x of [-14, 0, 14]) {
                for (const z of [3, 17, 31, 45]) {
                    const fixture = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.045, 12), downlightMat);
                    fixture.position.set(x, 14.72, z);
                    scene.add(fixture);
                }
            }

            const aisleGlowMat = new THREE.MeshBasicMaterial({ color: 0xffb16b, toneMapped: false });
            for (const side of [-1, 1]) {
                for (let r = 0; r < 3; r++) {
                    const marker = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 1.25), aisleGlowMat);
                    marker.position.set(side * 7.8, -4.82 + r * 0.88, 12 + r * 7.0);
                    scene.add(marker);
                    aisleLights.push(marker);
                }
            }

            wallGlowLeft = new THREE.PointLight(0x9b8b78, 0.28, 18, 2);
            wallGlowRight = new THREE.PointLight(0x9b8b78, 0.28, 18, 2);
            // Pull both glow lights inward from the side walls and lower them to floor level,
            // behind the seating area rather than high up on the side walls.
            wallGlowLeft.position.set(-9, -4.25, 49);
            wallGlowRight.position.set(9, -4.25, 49);
            scene.add(wallGlowLeft, wallGlowRight);

            createTheaterSeats();
        }

        function createTheaterSeats() {
            // Premium black leather recliners; isolated from the unchanged screen/ScreenX system.
            const upholstery = new THREE.MeshStandardMaterial({ color: 0x171819, roughness: 0.46, metalness: 0.025 });
            const cushionMat = new THREE.MeshStandardMaterial({ color: 0x252629, roughness: 0.60, metalness: 0.015 });
            const seamMat = new THREE.MeshStandardMaterial({ color: 0x3a3b3d, roughness: 0.62, metalness: 0.02 });
            const trimMat = new THREE.MeshStandardMaterial({ color: 0x101112, roughness: 0.48, metalness: 0.28 });
            const cupMat = new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 0.25, metalness: 0.58 });
            const riserMat = new THREE.MeshStandardMaterial({ color: 0x202123, roughness: 0.97, metalness: 0.01 });
            const seatGroup = new THREE.Group();
            const rows = 3;
            const seatsPerRow = 5;
            const seatSpacing = 2.75;
            const rowSpacing = 5.0;

            for (let r = 0; r < rows; r++) {
                const zPos = 9.0 + r * rowSpacing;
                const floorY = -5.0 + r * 0.85;
                const platformTop = floorY + 0.06;
                const platformHeight = Math.max(0.06, platformTop + 5.0);
                const riser = new THREE.Mesh(new THREE.BoxGeometry(15.5, platformHeight, 4.2), riserMat);
                riser.position.set(0, -5.0 + platformHeight / 2, zPos);
                riser.receiveShadow = true;
                seatGroup.add(riser);

                for (let s = 0; s < seatsPerRow; s++) {
                    const xPos = (s - (seatsPerRow - 1) / 2) * seatSpacing;
                    const seat = new THREE.Group();
                    seat.position.set(xPos, floorY, zPos);

                    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.12, 0.82), trimMat);
                    foot.position.set(0, 0.12, 0);
                    seat.add(foot);
                    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.40, 0.28), trimMat);
                    pedestal.position.set(0, 0.37, 0.02);
                    seat.add(pedestal);

                    const base = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.32, 1.30), upholstery);
                    base.position.set(0, 0.65, -0.08);
                    seat.add(base);
                    const topCushion = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.16, 1.12), cushionMat);
                    topCushion.position.set(0, 0.85, -0.12);
                    seat.add(topCushion);
                    const seam = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.012, 0.022), seamMat);
                    seam.position.set(0, 0.94, -0.20);
                    seat.add(seam);

                    const back = new THREE.Mesh(new THREE.BoxGeometry(1.48, 1.42, 0.30), upholstery);
                    back.position.set(0, 1.50, 0.50);
                    back.rotation.x = -0.09;
                    seat.add(back);
                    const backPad = new THREE.Mesh(new THREE.BoxGeometry(1.26, 1.06, 0.12), cushionMat);
                    backPad.position.set(0, 1.51, 0.31);
                    backPad.rotation.x = -0.09;
                    seat.add(backPad);
                    const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.38, 0.29), cushionMat);
                    headrest.position.set(0, 2.20, 0.43);
                    headrest.rotation.x = -0.08;
                    seat.add(headrest);

                    for (const side of [-1, 1]) {
                        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.42, 1.08), upholstery);
                        arm.position.set(side * 0.86, 0.96, -0.02);
                        seat.add(arm);
                        const armTop = new THREE.Mesh(new THREE.BoxGeometry(0.245, 0.065, 0.96), cushionMat);
                        armTop.position.set(side * 0.86, 1.20, -0.03);
                        seat.add(armTop);
                        const cupHolder = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.075, 0.09, 12), cupMat);
                        cupHolder.position.set(side * 0.86, 1.29, -0.33);
                        seat.add(cupHolder);
                    }

                    const frontTrim = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.025, 0.03), seamMat);
                    frontTrim.position.set(0, 0.92, -0.73);
                    seat.add(frontTrim);
                    seatGroup.add(seat);
                }
            }
            scene.add(seatGroup);
        }
        // --- 3. Advanced Subdivided IMAX Screen & Frame Geometry ---
        function createIMAXScreen() {
            if (screenMesh) {
                scene.remove(screenMesh);
                if (screenGeometry) screenGeometry.dispose();
                if (screenMaterial) screenMaterial.dispose();
            }
            if (screenFrameMesh) {
                scene.remove(screenFrameMesh);
                if (screenFrameMesh.geometry) screenFrameMesh.geometry.dispose();
            }
            if (screenRimGlowMesh) {
                scene.remove(screenRimGlowMesh);
                if (screenRimGlowMesh.geometry) screenRimGlowMesh.geometry.dispose();
            }
            if (videoTexture) videoTexture.dispose();
            if (screenXGroup) {
                scene.remove(screenXGroup);
                screenXGroup.traverse(obj => {
                    if (obj.geometry) obj.geometry.dispose();
                    if (obj.material) {
                        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                        mats.forEach(m => { if (m.map && m.map !== videoTexture) m.map.dispose(); m.dispose(); });
                    }
                });
            }
            screenXMaterials = [];
            const screenHeight = 14 * state.scale;
            const screenWidth = screenHeight * state.aspectRatio;

            // Highly subdivided geometry for stable depth displacement & curved geometry
            const segmentsX = 120;
            const segmentsY = 60;
            screenGeometry = new THREE.PlaneGeometry(screenWidth, screenHeight, segmentsX, segmentsY);
            
            // Apply base mathematical IMAX curvature
            applyScreenCurvatureGeometry(screenGeometry, screenWidth, state.curvature);

            videoTexture = new THREE.VideoTexture(video);
            videoTexture.minFilter = THREE.LinearFilter;
            videoTexture.magFilter = THREE.LinearFilter;
            videoTexture.format = THREE.RGBAFormat;
            videoTexture.colorSpace = THREE.SRGBColorSpace || undefined;
            videoTexture.generateMipmaps = false;
            videoTexture.wrapS = THREE.ClampToEdgeWrapping;
            if (state.screenX) { videoTexture.repeat.set(0.5, 1); videoTexture.offset.set(0.25, 0); }
            else { videoTexture.repeat.set(1, 1); videoTexture.offset.set(0, 0); }

            screenMaterial = new THREE.MeshBasicMaterial({ map: videoTexture, side: THREE.DoubleSide, toneMapped: false });
            screenMesh = new THREE.Mesh(screenGeometry, screenMaterial);
            screenMesh.frustumCulled = false;
            const centerY = screenHeight / 2 - 2;
            screenMesh.position.set(0, centerY, 0);
            scene.add(screenMesh);

            // Realistic Screen Frame Backing
            const frameGeo = new THREE.BoxGeometry(screenWidth + 0.6, screenHeight + 0.6, 0.4);
            const frameMat = new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.95 });
            screenFrameMesh = new THREE.Mesh(frameGeo, frameMat);
            screenFrameMesh.position.set(0, centerY, -6.0);
            scene.add(screenFrameMesh);

            // Screen rim glow: preserve the original plane size, depth, colour-following,
            // additive blending and toggle behaviour. Z=-1.5 matches the original placement
            // relative to the screen (screen plane at Z=0); values are Three.js world units.
            const rimGeo = new THREE.PlaneGeometry(screenWidth + 2.0, screenHeight + 2.0);
            const rimMat = new THREE.MeshBasicMaterial({
                color: 0x3b82f6,
                transparent: true,
                opacity: state.glowEnabled ? 0.35 : 0.0,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending,
                depthTest: true,
                depthWrite: false,
                toneMapped: false
            });
            screenRimGlowMesh = new THREE.Mesh(rimGeo, rimMat);
            screenRimGlowMesh.position.set(0, centerY, -1.5);
            scene.add(screenRimGlowMesh);

            if (state.screenX) createScreenXPanels(screenWidth, screenHeight);
            updateDepthMeshDisplacement();
            updateStatus();
        }

        function updateBackWallCurvature() {
            if (!backWallGeometry || !backWallGeometry.attributes.position) return;
            const positions = backWallGeometry.attributes.position;
            // Fixed room-wall bow: endpoints stay at the side-wall junctions (z=-3.075),
            // while the center bows at least 3.15 units farther back, safely behind the
            // screen frame at z=-6. The curvature control can deepen this bow slightly.
            const sagitta = 3.15 + Math.abs(state.curvature) * 0.5;
            for (let i = 0; i < positions.count; i++) {
                const x = positions.getX(i);
                const normalizedX = x / 26;
                positions.setZ(i, -sagitta * (1 - normalizedX * normalizedX));
            }
            positions.needsUpdate = true;
            backWallGeometry.computeVertexNormals();
            backWallGeometry.computeBoundingSphere();
        }

        function applyScreenCurvatureGeometry(geometry, width, curvatureVal) {
            const pos = geometry.attributes.position;
            const sagitta = Math.abs(curvatureVal) * 3.2;
            const curveSign = curvatureVal > 0 ? 1 : -1;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i);
                const normalizedX = x / (width / 2);
                const zOffset = sagitta * normalizedX * normalizedX;
                pos.setZ(i, Math.abs(curvatureVal) < 0.005 ? 0 : curveSign * zOffset);
            }
            geometry.computeVertexNormals();
            geometry.attributes.position.needsUpdate = true;
        }

        function createScreenXPanels(screenWidth, screenHeight) {
            screenXGroup = new THREE.Group();
            const panelWidth = screenWidth * 0.58;
            const panelHeight = screenHeight;
            const angle = 0.58;
            const centerY = screenHeight / 2 - 2;
            [-1, 1].forEach(side => {
                const geo = new THREE.PlaneGeometry(panelWidth, panelHeight, 32, 1);
                const pos = geo.attributes.position;
                const panelCurveDirection = state.curvature > 0 ? 1 : -1;
                const panelCurveStrength = Math.abs(state.curvature) * 0.34;
                for (let i = 0; i < pos.count; i++) {
                    const x = pos.getX(i);
                    const normalizedX = x / (panelWidth / 2);
                    pos.setZ(i, Math.abs(state.curvature) < 0.005 ? 0 : panelCurveDirection * panelCurveStrength * normalizedX * normalizedX);
                }
                geo.computeVertexNormals();
                const tex = videoTexture.clone();
                tex.needsUpdate = true;
                tex.repeat.set(0.25, 1);
                tex.offset.set(side < 0 ? 0 : 0.75, 0);
                tex.wrapS = THREE.ClampToEdgeWrapping;
                const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false });
                screenXMaterials.push(mat);
                const panel = new THREE.Mesh(geo, mat);
                panel.position.set(side * (screenWidth / 2 + panelWidth * 0.40), centerY, -0.35);
                panel.rotation.y = side < 0 ? angle : -angle;
                screenXGroup.add(panel);
            });
            scene.add(screenXGroup);
        }
        // --- 4. Advanced Modular Depth & Dynamic Parallax System ---
        function updateDepthMeshDisplacement() {
            if (!screenGeometry || !screenGeometry.attributes.position) return;

            const pos = screenGeometry.attributes.position;
            const height = 14 * state.scale;
            const width = height * state.aspectRatio;
            const sagitta = Math.abs(state.curvature) * 3.2;
            const curveSign = state.curvature > 0 ? 1 : -1;
            const camX = camera ? camera.position.x : 0;
            // Keep parallax subtle and bounded so camera movement cannot make the mesh snap.
            const parallaxFactor = THREE.MathUtils.clamp(camX / 30, -1, 1) * state.depthStrength;

            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i);
                const y = pos.getY(i);
                const normalizedX = THREE.MathUtils.clamp(x / (width / 2), -1, 1);
                const normalizedY = THREE.MathUtils.clamp(y / (height / 2), -1, 1);
                const baseZ = Math.abs(state.curvature) < 0.005 ? 0 : curveSign * sagitta * normalizedX * normalizedX;
                let depthVal = 0;

                if (state.depthMode === 'parallax') {
                    // Stable, edge-tapered displacement avoids pinched or flickering screen edges.
                    const edgeFade = Math.sin((1 - Math.abs(normalizedX)) * Math.PI * 0.5);
                    depthVal = Math.sin(normalizedX * Math.PI) * parallaxFactor * 0.7 * edgeFade;
                } else if ((state.depthMode === 'depthMap' || state.depthMode === 'aiVideoDepth') && depthDataArray) {
                    const colIdx = Math.min(63, Math.max(0, Math.floor((normalizedX * 0.5 + 0.5) * 64)));
                    const rowIdx = Math.min(35, Math.max(0, Math.floor((0.5 - normalizedY * 0.5) * 36)));
                    const sample = depthDataArray[rowIdx * 64 + colIdx];
                    const luma = sample === undefined ? 128 : sample; // Preserve true black (0) pixels.
                    // Brightness is a depth cue, not a white overlay. Increase displacement so the
                    // uploaded map is visibly expressed by the screen surface while retaining edge falloff.
                    const edgeFadeX = Math.sin((1 - Math.abs(normalizedX)) * Math.PI * 0.5);
                    const edgeFadeY = Math.sin((1 - Math.abs(normalizedY)) * Math.PI * 0.5);
                    depthVal = THREE.MathUtils.clamp(((luma - 128) / 127) * state.depthStrength * 1.5, -1.6, 1.6) * edgeFadeX * edgeFadeY;
                }

                pos.setZ(i, baseZ + depthVal);
            }

            // MeshBasicMaterial does not use normals; skipping their recalculation saves CPU every camera update.
            pos.needsUpdate = true;
            screenGeometry.computeBoundingSphere();
        }

        function analyzeVideoDepthMap(timestamp) {
            if (state.depthMode !== 'depthMap' || video.paused || video.readyState < 2) return;
            // Luma depth does not need to be recalculated at display refresh rate.
            const now = Number.isFinite(timestamp) ? timestamp : performance.now();
            if (now - lastDepthAnalysisTime < 100) return; // about 10 analyses per second
            lastDepthAnalysisTime = now;
            try {
                depthCtx.drawImage(video, 0, 0, depthCanvas.width, depthCanvas.height);
                const imgData = depthCtx.getImageData(0, 0, depthCanvas.width, depthCanvas.height).data;
                const pixelCount = depthCanvas.width * depthCanvas.height;
                if (!depthDataArray || depthDataArray.length !== pixelCount) {
                    depthDataArray = new Uint8Array(pixelCount);
                    depthAnalysisTarget = new Uint8Array(pixelCount);
                    depthDataArray.fill(128);
                }
                for (let i = 0, p = 0; i < imgData.length; i += 4, p++) {
                    const luma = 0.299 * imgData[i] + 0.587 * imgData[i + 1] + 0.114 * imgData[i + 2];
                    depthAnalysisTarget[p] = luma;
                    // Temporal low-pass filtering reduces frame-to-frame brightness shimmer.
                    depthDataArray[p] = Math.round(depthDataArray[p] * 0.72 + depthAnalysisTarget[p] * 0.28);
                }
                updateDepthMeshDisplacement();
            } catch (e) { /* Fallback gracefully on CORS restrictions */ }
        }

        // Dust particles, projector light rays, and demo 3D objects have been removed.
        // Keep these no-op functions because the main initialization/animation flow calls them.
        function initCinematicEffects() {}
        function updateCinematicEffects(time) {}

        function setScreenXMode(enabled) {
            state.screenX = !!enabled;
            const btn = document.getElementById('btn-screenx');
            btn.textContent = state.screenX ? 'IMAX + SCREENX' : 'IMAX ONLY';
            btn.setAttribute('aria-pressed', String(state.screenX));
            btn.classList.toggle('control-active', state.screenX);
            document.getElementById('mode-description').textContent = state.screenX ? 'Center + left/right side-wall projection' : 'Center screen projection only';
            createIMAXScreen();
        }

        function updateStatus(message) {
            const pill = document.getElementById('status-pill');
            if (!pill) return;
            pill.textContent = message || (state.screenX ? 'READY · IMAX + SCREENX' : 'READY · IMAX ONLY');
            pill.classList.toggle('text-cyan-300', state.screenX);
            pill.classList.toggle('text-emerald-300', !state.screenX);
        }
        // --- 6. Video Player & Ambilight Engine ---
        // Bright premium auditorium before playback; immersive dark mode during playback.
        function setCinemaLighting(isPlaying) {
            cinemaPlayingMode = !!isPlaying;
            if (ambientLight) ambientLight.intensity = cinemaPlayingMode ? 0.42 : 1.05;
            if (overheadLight) overheadLight.intensity = cinemaPlayingMode ? 0.14 : 0.78;
            if (spotLight) spotLight.intensity = cinemaPlayingMode ? Math.max(0.28, state.lightIntensity * 0.85) : 0.55;
            if (wallGlowLeft) wallGlowLeft.intensity = cinemaPlayingMode ? 0.14 : 0.32;
            if (wallGlowRight) wallGlowRight.intensity = cinemaPlayingMode ? 0.14 : 0.32;
            aisleLights.forEach(light => {
                if (light.material && light.material.color) light.material.color.setHex(cinemaPlayingMode ? 0xb77d4d : 0xffb16b);
            });
            if (renderer) renderer.toneMappingExposure = cinemaPlayingMode ? 0.92 : 1.08;
        }

        function initVideoPlayer() {
            // Tap the 3D canvas to hide/show all UI controls together.
            const playerBar = document.getElementById('player-bar');
            const canvasContainer = document.getElementById('canvas-container');
            let playerHideTimer = null;
            const hidePlayerControls = () => {
                if (playerHideTimer) clearTimeout(playerHideTimer);
                if (playerBar.contains(document.activeElement)) document.activeElement.blur();
                playerBar.classList.add('player-controls-hidden');
                document.body.classList.add('cinema-ui-hidden');
            };
            const showPlayerControls = () => {
                document.body.classList.remove('cinema-ui-hidden');
                playerBar.classList.remove('player-controls-hidden');
                if (playerHideTimer) clearTimeout(playerHideTimer);
                playerHideTimer = setTimeout(() => {
                    if (!playerBar.contains(document.activeElement)) hidePlayerControls();
                }, 5000);
            };
            document.addEventListener('pointerdown', (e) => {
                const target = e.target;
                const isCanvasTap = target === canvasContainer || (target.tagName === 'CANVAS' && target.parentElement === canvasContainer);
                if (isCanvasTap) {
                    if (document.body.classList.contains('cinema-ui-hidden')) showPlayerControls();
                    else hidePlayerControls();
                    return;
                }
                if (target.closest('button, input, select, label, #controls-panel, #player-bar, #quick-controls, .cinema-side-tools, .cinema-icon-tool')) {
                    showPlayerControls();
                    return;
                }
                if (document.body.classList.contains('cinema-ui-hidden')) showPlayerControls();
            }, {passive:true});
            document.addEventListener('pointermove', (e) => {
                if (e.pointerType !== 'touch' && !document.body.classList.contains('cinema-ui-hidden')) showPlayerControls();
            }, {passive:true});
            document.addEventListener('mousemove', () => {
                if (!document.body.classList.contains('cinema-ui-hidden')) showPlayerControls();
            }, {passive:true});
            document.addEventListener('keydown', showPlayerControls);
            playerBar.addEventListener('pointermove', (e) => {
                if (e.pointerType !== 'touch') showPlayerControls();
            }, {passive:true});
            showPlayerControls();
            setCinemaLighting(false);
            video.src = SAMPLES.sample1;
            video.volume = 0.8;
            video.addEventListener('loadedmetadata', () => {
                timeTotal.textContent = formatTime(video.duration || 0);
                seekBar.value = 0;
                updateStatus('VIDEO READY');
                if (videoTexture) videoTexture.needsUpdate = true;
            });
            video.addEventListener('playing', () => { setInteriorBlackMode(true); setCinemaLighting(true); updatePlayButtonUI(true); updateStatus(state.screenX ? 'PLAYING · IMAX + SCREENX' : 'PLAYING · IMAX ONLY'); });
            video.addEventListener('pause', () => { setInteriorBlackMode(false); setCinemaLighting(false); updatePlayButtonUI(false); updateStatus(state.screenX ? 'PAUSED · IMAX + SCREENX' : 'PAUSED · IMAX ONLY'); });
            video.addEventListener('error', () => updateStatus('VIDEO ERROR · TRY UPLOAD'));

            btnPlay.addEventListener('click', togglePlay);
            video.addEventListener('click', togglePlay);
            document.getElementById('btn-restart').addEventListener('click', () => {
                try { video.currentTime = 0; } catch (_) {}
                video.play().then(() => updatePlayButtonUI(true)).catch(() => updateStatus('RESTARTED · TAP PLAY'));
            });
            video.addEventListener('ended', () => { setInteriorBlackMode(false); setCinemaLighting(false); updatePlayButtonUI(false); });

            video.addEventListener('timeupdate', () => {
                if (!isNaN(video.duration)) {
                    const progress = (video.currentTime / video.duration) * 100;
                    seekBar.value = progress;
                    timeCurrent.textContent = formatTime(video.currentTime);
                    timeTotal.textContent = formatTime(video.duration);
                }
            });

            seekBar.addEventListener('input', () => {
                if (Number.isFinite(video.duration) && video.duration > 0) {
                    const targetTime = (seekBar.value / 100) * video.duration;
                    video.currentTime = targetTime;
                }
            });

            btnMute.addEventListener('click', () => {
                video.muted = !video.muted;
                btnMute.innerHTML = video.muted ? 
                    '<i class="fa-solid fa-volume-xmark text-red-400"></i>' : 
                    '<i class="fa-solid fa-volume-high"></i>';
            });

            volumeBar.addEventListener('input', () => {
                video.volume = volumeBar.value;
                video.muted = (video.volume === 0);
            });

            const playerPanel = document.getElementById('vlc-key-panel');
            function seekBy(seconds) { if (Number.isFinite(video.duration)) video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds)); }
            function setVolume(value) { video.volume = Math.max(0, Math.min(1, value)); volumeBar.value = video.volume; if (video.volume > 0) video.muted = false; }
            function setSpeed(value) { video.playbackRate = Math.max(0.25, Math.min(4, value)); updateStatus('PLAYBACK SPEED · ' + video.playbackRate.toFixed(2) + '×'); }
            function playerAction(action, percent) {
                switch (action) {
                    case 'play': togglePlay(); break;
                    case 'stop': video.pause(); video.currentTime = 0; break;
                    case 'back5': seekBy(-5); break; case 'forward5': seekBy(5); break;
                    case 'back60': seekBy(-60); break; case 'forward60': seekBy(60); break;
                    case 'mute': btnMute.click(); break;
                    case 'volDown': setVolume(video.volume - 0.05); break; case 'volUp': setVolume(video.volume + 0.05); break;
                    case 'speedDown': setSpeed(video.playbackRate - 0.25); break; case 'speedUp': setSpeed(video.playbackRate + 0.25); break; case 'speedReset': setSpeed(1); break;
                    case 'start': video.currentTime = 0; break; case 'end': if (Number.isFinite(video.duration)) video.currentTime = video.duration; break;
                    case 'fullscreen': document.getElementById('btn-fullscreen').click(); break;
                    case 'jump': if (Number.isFinite(video.duration)) video.currentTime = video.duration * (Number(percent) / 100); break;
                    case 'subtitles': {
                        let tracks = video.textTracks;
                        let hasTracks = tracks && tracks.length > 0;
                        if (!hasTracks) { updateStatus('SUBTITLES · LOAD A VIDEO WITH CAPTIONS'); break; }
                        let turnOn = !Array.from(tracks).some(t => t.mode === 'showing');
                        Array.from(tracks).forEach(t => t.mode = turnOn ? 'showing' : 'hidden');
                        const b = playerPanel.querySelector('[data-player-action="subtitles"]');
                        if (b) b.setAttribute('aria-pressed', String(turnOn));
                        updateStatus(turnOn ? 'SUBTITLES ON' : 'SUBTITLES OFF'); break;
                    }
                    case 'repeat': video.loop = !video.loop; {
                        const b = playerPanel.querySelector('[data-player-action="repeat"]');
                        if (b) b.setAttribute('aria-pressed', String(video.loop));
                        updateStatus(video.loop ? 'REPEAT ON' : 'REPEAT OFF'); break;
                    }
                    case 'more': updateStatus('MORE OPTIONS · USE CONTROLS PANEL'); break;
                    case 'help': updateStatus('KEYS: Space play/pause · ←/→ 5s · Ctrl+←/→ 60s · ↑/↓ volume · M mute · [/] speed · F fullscreen · S stop'); break;
                }
            }
            playerPanel.addEventListener('click', (e) => { const b = e.target.closest('[data-player-action]'); if (b) playerAction(b.dataset.playerAction, b.dataset.percent); });
            document.addEventListener('keydown', (e) => {
                const el = e.target; const tag = el && el.tagName ? el.tagName.toLowerCase() : '';
                if (['input','textarea','select'].includes(tag) || (el && el.isContentEditable) || e.altKey || e.metaKey) return;
                if (e.code === 'Space') { e.preventDefault(); togglePlay(); return; }
                if (e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); seekBy(e.key === 'ArrowLeft' ? -60 : 60); return; }
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); seekBy(e.key === 'ArrowLeft' ? -5 : 5); return; }
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); setVolume(video.volume + (e.key === 'ArrowUp' ? 0.05 : -0.05)); return; }
                if (e.key.toLowerCase() === 'm') playerAction('mute');
                else if (e.key.toLowerCase() === 'f') document.getElementById('btn-fullscreen').click();
                else if (e.key.toLowerCase() === 's') playerAction('stop');
                else if (e.key === '[') playerAction('speedDown'); else if (e.key === ']') playerAction('speedUp'); else if (e.key === '\\') playerAction('speedReset');
                else if (e.key === 'Home') { e.preventDefault(); playerAction('start'); } else if (e.key === 'End') { e.preventDefault(); playerAction('end'); }
                else if (e.key === '5' && Number.isFinite(video.duration)) { video.currentTime = video.duration * 0.5; }
                else if (e.key === '?') playerAction('help');
            });

            videoFileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    videoDepthAnalysisCancelled = true;
                    videoDepthAnalysisReady = false;
                    precomputedVideoDepthFrames = [];
                    currentAppliedDepthFrameIndex = -1;
                    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
                    currentObjectUrl = URL.createObjectURL(file);
                    video.src = currentObjectUrl;
                    video.load();
                    videoDepthAnalysisReady = false;
                    precomputedVideoDepthFrames = [];
                    currentAppliedDepthFrameIndex = -1;
                    const readyButton = document.getElementById('btn-play-when-ready');
                    if (readyButton) { readyButton.disabled = true; readyButton.style.opacity = '0.5'; readyButton.style.cursor = 'not-allowed'; }
                    if (state.depthMode === 'aiVideoDepth') {
                        video.pause();
                        document.getElementById('ai-depth-status').textContent = 'Video loaded. Tap Analyze Video; playback will be available when analysis finishes.';
                        updateStatus('VIDEO LOADED · ANALYZE DEPTH FIRST');
                    } else {
                        video.play().catch(() => updateStatus('VIDEO LOADED · TAP PLAY'));
                    }
                }
            });
        }

        function togglePlay() {
            if (state.depthMode === 'aiVideoDepth' && !videoDepthAnalysisReady) {
                document.getElementById('ai-depth-status').textContent = 'Analyze the video first, then press Play when ready.';
                return;
            }
            if (video.paused) {
                video.play().then(() => updatePlayButtonUI(true)).catch(err => console.log("Playback interaction required: ", err));
            } else {
                video.pause();
                updatePlayButtonUI(false);
            }
        }


        // Movie mode: black out the auditorium while keeping the main image and ScreenX picture visible.
        const interiorBlackRestore = new Map();
        function isDescendantOf(object, ancestor) {
            let node = object;
            while (node) { if (node === ancestor) return true; node = node.parent; }
            return false;
        }
        function setInteriorBlackMode(enabled) {
            if (!scene) return;
            if (enabled) {
                scene.traverse((object) => {
                    // Preserve the actual movie surfaces and rim-glow effect.
                    const isDisplay = isDescendantOf(object, screenMesh) ||
                        isDescendantOf(object, screenXGroup);
                    if (object.isLight) {
                        if (!interiorBlackRestore.has(object)) interiorBlackRestore.set(object, { kind: 'light', intensity: object.intensity });
                        object.intensity = 0;
                    } else if (object.isMesh && !isDisplay && object !== screenRimGlowMesh) {
                        if (!interiorBlackRestore.has(object)) {
                            const original = object.material;
                            const dark = Array.isArray(original) ? original.map(m => m.clone()) : original.clone();
                            const darkMats = Array.isArray(dark) ? dark : [dark];
                            darkMats.forEach((m) => {
                                if (m.color) m.color.set(0x000000);
                                if (m.emissive) m.emissive.set(0x000000);
                                if ('emissiveIntensity' in m) m.emissiveIntensity = 0;
                            });
                            interiorBlackRestore.set(object, { kind: 'mesh', material: original, darkMaterial: dark });
                            object.material = dark;
                        }
                    }
                });

            } else {
                for (const [object, saved] of interiorBlackRestore.entries()) {
                    if (saved.kind === 'light') object.intensity = saved.intensity;
                    else if (saved.kind === 'mesh') {
                        object.material = saved.material;
                        if (Array.isArray(saved.darkMaterial)) saved.darkMaterial.forEach(m => m.dispose());
                        else saved.darkMaterial.dispose();
                    }
                }
                interiorBlackRestore.clear();

            }
        }

        function updatePlayButtonUI(isPlaying) {
            // Keep both the small blue play button and the large white reference button in sync.
            btnPlay.innerHTML = isPlaying ?
                '<i class="fa-solid fa-pause text-base"></i>' :
                '<i class="fa-solid fa-play text-base"></i>';
            const refPlayIcon = document.getElementById('ref-play-icon');
            const refPlayButton = document.querySelector('#vlc-key-panel [data-player-action="play"]');
            if (refPlayIcon) refPlayIcon.className = isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play';
            if (refPlayButton) {
                refPlayButton.setAttribute('aria-label', isPlaying ? 'Pause video' : 'Play video');
                refPlayButton.setAttribute('title', isPlaying ? 'Pause' : 'Play');
                refPlayButton.setAttribute('aria-pressed', String(!!isPlaying));
            }
        }

        // Realtime Dynamic Ambilight Engine
        function updateDynamicAmbilight() {
            frameCounter++;
            if (frameCounter % 6 !== 0) return;
            if (video.paused || video.ended || video.readyState < 2) return;

            try {
                analysisCtx.drawImage(video, 0, 0, analysisCanvas.width, analysisCanvas.height);
                const frameData = analysisCtx.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height).data;

                let r = 0, g = 0, b = 0;
                const totalPixels = frameData.length / 4;

                for (let i = 0; i < frameData.length; i += 4) {
                    r += frameData[i];
                    g += frameData[i + 1];
                    b += frameData[i + 2];
                }

                r = Math.floor(r / totalPixels);
                g = Math.floor(g / totalPixels);
                b = Math.floor(b / totalPixels);

                const targetColor = new THREE.Color(`rgb(${r}, ${g}, ${b})`);
                spotLight.color.lerp(targetColor, 0.1);
                spotLight.intensity = state.lightIntensity * (state.themeMode === 'glow' ? 2.2 : 1.2);
                if (wallGlowLeft) {
                    wallGlowLeft.color.lerp(targetColor, 0.08);
                    wallGlowRight.color.lerp(targetColor, 0.08);
                    const wallIntensity = state.sideWallIntensity * (state.themeMode === 'glow' ? 3.15 : 0.92);
                    wallGlowLeft.intensity = wallIntensity;
                    wallGlowRight.intensity = wallIntensity;
                }
                aisleLights.forEach(light => { light.material.color.lerp(targetColor, 0.025); });

            } catch (e) { /* CORS fallback */ }
        }

        // --- 7. UI Controls & Event Handling ---
        function setupUIEventListeners() {
            const btnToggleUI = document.getElementById('btn-toggle-ui');
            const btnClosePanel = document.getElementById('btn-close-panel');
            const btnGlow = document.getElementById('btn-glow-toggle');

            // Relocate the existing controls (not clones) so their original handlers/state remain intact.
            const quickControls = document.getElementById('quick-controls');
            const seatWrap = document.getElementById('btn-choose-seat').parentElement;
            document.getElementById('side-seat-slot').appendChild(seatWrap);
            document.getElementById('side-rim-slot').appendChild(btnGlow);
            // Keep the original ratio controls hidden in their source wrapper; side icons call them directly.
            document.getElementById('btn-choose-seat').insertAdjacentHTML('beforeend', '<span class="tool-label">Seat No.</span>');
            btnGlow.insertAdjacentHTML('beforeend', '<span class="tool-label">Rim Light Glow</span>');
            quickControls.style.display = 'none';

            // Side shortcuts invoke the original controls, preserving their existing behavior.
            const sideRatioToggle = document.getElementById('side-ratio-toggle');
            function syncSideRatioToggle() {
                const ratioLabel = state.aspectRatio >= 1.6 ? '1.90:1' : '1.43:1';
                sideRatioToggle.querySelector('.tool-label').textContent = 'Aspect ' + ratioLabel;
                sideRatioToggle.title = 'Aspect Ratio ' + ratioLabel + ' (tap to toggle)';
                sideRatioToggle.setAttribute('aria-label', 'Current aspect ratio ' + ratioLabel + '. Tap to toggle');
            }
            sideRatioToggle.addEventListener('click', () => {
                const nextRatio = state.aspectRatio >= 1.6 ? '1.43' : '1.90';
                document.querySelector('.btn-aspect[data-ratio="' + nextRatio + '"]').click();
            });
            syncSideRatioToggle();
            document.getElementById('side-imax-toggle').addEventListener('click', () => document.getElementById('btn-screenx').click());
            document.getElementById('side-fit-toggle').addEventListener('click', () => document.getElementById('btn-edge-fit').click());
            document.getElementById('side-theme-toggle').addEventListener('click', () => {
                if (state.themeMode === 'dark') document.getElementById('btn-theme-glow').click();
                else document.getElementById('btn-theme-dark').click();
                const glowMode = state.themeMode === 'glow';
                const themeButton = document.getElementById('side-theme-toggle');
                themeButton.querySelector('i').className = glowMode ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
                themeButton.querySelector('.tool-label').textContent = glowMode ? 'Full Ambilight' : 'Dark Cinema';
            });
            // Tapping an icon performs its action and reveals the label; hover works on desktop.
            document.querySelectorAll('.cinema-side-tools button, .cinema-icon-tool').forEach(tool => tool.addEventListener('click', () => {
                tool.classList.add('label-open');
                window.setTimeout(() => tool.classList.remove('label-open'), 1500);
            }));
            // The old eye / eye-slash toolbar visibility buttons are intentionally removed.
            const restoreToolbar = document.getElementById('btn-restore-toolbar');
            if (restoreToolbar) restoreToolbar.remove();
            const oldHideToolbar = document.getElementById('btn-hide-toolbar');
            if (oldHideToolbar) oldHideToolbar.remove();

            btnGlow.addEventListener('click', () => {
                state.glowEnabled = !state.glowEnabled;
                btnGlow.querySelector('#glow-toggle-text').textContent = state.glowEnabled ? 'Rim Glow: ON' : 'Rim Glow: OFF';
                btnGlow.setAttribute('aria-pressed', String(state.glowEnabled));
                btnGlow.classList.toggle('bg-indigo-600/20', state.glowEnabled);
                btnGlow.classList.toggle('text-indigo-300', state.glowEnabled);
                btnGlow.classList.toggle('text-slate-400', !state.glowEnabled);
                if (screenRimGlowMesh) screenRimGlowMesh.material.opacity = state.glowEnabled ? 0.35 : 0;
                saveSettings();
            });

            btnToggleUI.addEventListener('click', () => {
                controlsPanel.classList.toggle('translate-x-0');
                controlsPanel.classList.toggle('translate-x-full');
            });

            btnClosePanel.addEventListener('click', () => {
                controlsPanel.classList.add('translate-x-full');
            });

            document.getElementById('btn-screenx').addEventListener('click', () => { setScreenXMode(!state.screenX); saveSettings(); });

            // AI video depth is precomputed from sampled frames before playback. The frame cache
            // keeps inference out of the real-time render loop; mobile devices analyze at most 120 frames.
            const analyzeVideoDepthButton = document.getElementById('btn-analyze-video-depth');
            const cancelVideoDepthButton = document.getElementById('btn-cancel-video-analysis');
            const playWhenReadyButton = document.getElementById('btn-play-when-ready');
            const videoDepthProgressWrap = document.getElementById('video-depth-progress-wrap');
            const videoDepthProgress = document.getElementById('video-depth-progress');
            const videoDepthProgressLabel = document.getElementById('video-depth-progress-label');

            function setVideoDepthProgress(done, total, message) {
                const percent = total > 0 ? Math.round(done / total * 100) : 0;
                videoDepthProgress.style.width = percent + '%';
                videoDepthProgressLabel.textContent = message || (percent + '% · ' + done + '/' + total + ' frames');
            }

            function setPlayWhenReadyEnabled(enabled) {
                playWhenReadyButton.disabled = !enabled;
                playWhenReadyButton.style.opacity = enabled ? '1' : '0.5';
                playWhenReadyButton.style.cursor = enabled ? 'pointer' : 'not-allowed';
            }

            function setAnalysisBusy(busy) {
                analyzeVideoDepthButton.disabled = busy;
                analyzeVideoDepthButton.style.opacity = busy ? '0.5' : '1';
                cancelVideoDepthButton.hidden = !busy;
                cancelVideoDepthButton.disabled = !busy;
                cancelVideoDepthButton.style.opacity = busy ? '1' : '0.5';
            }

            cancelVideoDepthButton.addEventListener('click', () => {
                if (!videoDepthAnalysisInProgress) return;
                videoDepthAnalysisCancelled = true;
                cancelVideoDepthButton.disabled = true;
                cancelVideoDepthButton.textContent = 'Cancelling…';
                document.getElementById('ai-depth-status').textContent = 'Cancelling analysis safely…';
            });

            function waitForVideoEvent(el, eventName, timeoutMs = 15000) {
                return new Promise((resolve, reject) => {
                    let timer;
                    const cleanup = () => {
                        el.removeEventListener(eventName, onEvent);
                        el.removeEventListener('error', onError);
                        if (timer) clearTimeout(timer);
                    };
                    const onEvent = () => { cleanup(); resolve(); };
                    const onError = () => { cleanup(); reject(new Error('Could not read video frames. Check that the video is supported and loaded.')); };
                    el.addEventListener(eventName, onEvent, { once: true });
                    el.addEventListener('error', onError, { once: true });
                    timer = setTimeout(() => { cleanup(); reject(new Error('Timed out while loading/seeking the video. Try a shorter or locally stored video.')); }, timeoutMs);
                });
            }

            async function analyzeCurrentVideoForDepth() {
                const status = document.getElementById('ai-depth-status');
                if (videoDepthAnalysisInProgress) return;
                if (!video.currentSrc && !video.src) {
                    status.textContent = 'Upload or load a video first.';
                    videoFileInput.click();
                    return;
                }
                if (!Number.isFinite(video.duration) || video.duration <= 0) {
                    status.textContent = 'Wait until video metadata is loaded, then analyze again.';
                    return;
                }
                videoDepthAnalysisCancelled = false;
                currentAppliedDepthFrameIndex = -1;
                videoDepthAnalysisReady = false;
                videoDepthAnalysisInProgress = true;
                video.pause();
                setPlayWhenReadyEnabled(false);
                setAnalysisBusy(true);
                cancelVideoDepthButton.textContent = 'Cancel analysis';
                videoDepthProgressWrap.classList.remove('hidden');
                videoDepthProgressWrap.classList.add('flex');
                setVideoDepthProgress(0, 1, 'Loading AI model…');
                let analysisVideo = null;
                try {
                    if (!aiDepthPipelinePromise) aiDepthPipelinePromise = import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2');
                    const { pipeline, env } = await aiDepthPipelinePromise;
                    env.allowLocalModels = false;
                    if (!window.__imaxDepthEstimator) {
                        window.__imaxDepthEstimator = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', { device: 'webgpu' })
                            .catch(async () => await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small'));
                    }
                    if (videoDepthAnalysisCancelled) throw new Error('Analysis cancelled.');
                    const estimator = window.__imaxDepthEstimator;
                    analysisVideo = document.createElement('video');
                    analysisVideo.muted = true;
                    analysisVideo.preload = 'auto';
                    analysisVideo.playsInline = true;
                    analysisVideo.crossOrigin = 'anonymous';
                    analysisVideo.src = video.currentSrc || video.src;
                    analysisVideo.load();
                    if (analysisVideo.readyState < 1) await waitForVideoEvent(analysisVideo, 'loadedmetadata');
                    if (analysisVideo.readyState < 2) await waitForVideoEvent(analysisVideo, 'loadeddata');
                    const duration = Math.min(video.duration, analysisVideo.duration || video.duration);
                    const frameCount = Math.max(1, Math.min(120, Math.ceil(duration / Math.max(2.5, duration / 120))));
                    const interval = frameCount > 1 ? duration / (frameCount - 1) : 0;
                    const sampleCanvas = document.createElement('canvas');
                    sampleCanvas.width = 320;
                    sampleCanvas.height = 180;
                    const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
                    const frames = [];
                    setVideoDepthProgress(0, frameCount, 'AI model ready · analyzing video…');
                    for (let i = 0; i < frameCount; i++) {
                        if (videoDepthAnalysisCancelled) throw new Error('Analysis cancelled.');
                        const target = Math.min(Math.max(0, duration - 0.05), i * interval);
                        if (Math.abs(analysisVideo.currentTime - target) > 0.03) {
                            const seeked = waitForVideoEvent(analysisVideo, 'seeked');
                            analysisVideo.currentTime = target;
                            await seeked;
                        }
                        sampleCtx.drawImage(analysisVideo, 0, 0, sampleCanvas.width, sampleCanvas.height);
                        const result = await estimator(sampleCanvas);
                        if (videoDepthAnalysisCancelled) throw new Error('Analysis cancelled.');
                        // Transformers.js normally returns `depth` as a RawImage (with width/height)
                        // and `predicted_depth` as a Tensor (with dims). Prefer the image result;
                        // older code picked the Tensor first and incorrectly rejected valid frames.
                        const rawDepth = result && result.depth && result.depth.data ? result.depth : null;
                        const tensorDepth = result && result.predicted_depth && result.predicted_depth.data ? result.predicted_depth : null;
                        const depth = rawDepth || tensorDepth;
                        const dims = depth && (depth.dims || depth.shape);
                        const depthWidth = depth && Number.isFinite(depth.width) ? depth.width : (dims && dims.length ? Number(dims[dims.length - 1]) : 0);
                        const depthHeight = depth && Number.isFinite(depth.height) ? depth.height : (dims && dims.length > 1 ? Number(dims[dims.length - 2]) : 0);
                        if (!depth || !depth.data || !depthWidth || !depthHeight || depth.data.length < depthWidth * depthHeight) {
                            throw new Error('AI returned an unsupported depth output format.');
                        }
                        let min = Infinity, max = -Infinity;
                        for (let j = 0; j < depthWidth * depthHeight; j++) {
                            const v = Number(depth.data[j]);
                            if (Number.isFinite(v)) { min = Math.min(min, v); max = Math.max(max, v); }
                        }
                        if (!Number.isFinite(min) || !Number.isFinite(max) || max - min < 1e-8) throw new Error('AI depth range was too small.');
                        const normalized = new Uint8Array(depthCanvas.width * depthCanvas.height);
                        for (let y = 0; y < depthCanvas.height; y++) {
                            const sy = Math.min(depthHeight - 1, Math.floor(y / depthCanvas.height * depthHeight));
                            for (let x = 0; x < depthCanvas.width; x++) {
                                const sx = Math.min(depthWidth - 1, Math.floor(x / depthCanvas.width * depthWidth));
                                const v = Number(depth.data[sy * depthWidth + sx]);
                                normalized[y * depthCanvas.width + x] = Math.round(255 * (Number.isFinite(v) ? (v - min) / (max - min) : 0.5));
                            }
                        }
                        frames.push({ time: target, data: normalized });
                        setVideoDepthProgress(i + 1, frameCount);
                        status.textContent = 'Analyzing video with AI · frame ' + (i + 1) + ' of ' + frameCount + '…';
                    }
                    precomputedVideoDepthFrames = frames;
                    currentAppliedDepthFrameIndex = -1;
                    videoDepthAnalysisReady = true;
                    state.depthMode = 'aiVideoDepth';
                    document.getElementById('select-depth-mode').value = state.depthMode;
                    applyPrecomputedVideoDepth();
                    updateDepthMeshDisplacement();
                    setPlayWhenReadyEnabled(true);
                    status.textContent = 'Video analysis complete. Press “Play when ready” to start.';
                    updateStatus('AI VIDEO DEPTH READY');
                    saveSettings();
                } catch (err) {
                    const message = err && err.message ? err.message : 'unknown error';
                    videoDepthAnalysisReady = false;
                    precomputedVideoDepthFrames = [];
                    currentAppliedDepthFrameIndex = -1;
                    setPlayWhenReadyEnabled(false);
                    if (videoDepthAnalysisCancelled || /cancelled/i.test(message)) {
                        status.textContent = 'Analysis cancelled. You can analyze again or use Luma Depth.';
                        updateStatus('AI VIDEO DEPTH CANCELLED');
                    } else {
                        console.error('AI video depth analysis failed:', err);
                        status.textContent = 'Video analysis failed: ' + message.slice(0, 120) + '. Retry or use Luma Depth as fallback.';
                        updateStatus('AI VIDEO DEPTH ERROR · FALLBACK AVAILABLE');
                    }
                } finally {
                    if (analysisVideo) { analysisVideo.pause(); analysisVideo.removeAttribute('src'); analysisVideo.load(); }
                    videoDepthAnalysisInProgress = false;
                    setAnalysisBusy(false);
                    cancelVideoDepthButton.textContent = 'Cancel analysis';
                    videoDepthProgressWrap.classList.remove('flex');
                    videoDepthProgressWrap.classList.add('hidden');
                }
            }


            analyzeVideoDepthButton.addEventListener('click', analyzeCurrentVideoForDepth);
            playWhenReadyButton.addEventListener('click', () => {
                if (!videoDepthAnalysisReady || videoDepthAnalysisInProgress) return;
                state.depthMode = 'aiVideoDepth';
                document.getElementById('select-depth-mode').value = state.depthMode;
                applyPrecomputedVideoDepth();
                updateDepthMeshDisplacement();
                video.play().then(() => updatePlayButtonUI(true)).catch(() => { const statusEl = document.getElementById('ai-depth-status'); statusEl.textContent = 'Analysis is ready. Tap the main Play button to begin playback.'; });
            });

            document.getElementById('select-depth-mode').addEventListener('change', (e) => {
                state.depthMode = e.target.value;
                if (state.depthMode === 'aiVideoDepth' && !videoDepthAnalysisReady) {
                    document.getElementById('ai-depth-status').textContent = 'Tap Analyze Video to precompute AI depth before playback.';
                }
                updateDepthMeshDisplacement();
                saveSettings();
                updateStatus('DEPTH MODE · ' + state.depthMode.toUpperCase());
            });

            const sliderDepthStrength = document.getElementById('slider-depth-strength');
            sliderDepthStrength.addEventListener('input', (e) => {
                state.depthStrength = parseFloat(e.target.value);
                document.getElementById('val-depth-strength').textContent = state.depthStrength.toFixed(2);
                updateDepthMeshDisplacement();
                saveSettings();
            });

            document.getElementById('btn-reset-depth').addEventListener('click', () => {
                state.depthMode = 'parallax';
                state.depthStrength = 0.45;
                state.glowEnabled = true;
                document.getElementById('select-depth-mode').value = 'parallax';
                document.getElementById('slider-depth-strength').value = 0.45;
                document.getElementById('val-depth-strength').textContent = '0.45';
                btnGlow.textContent = 'ON';
                updateDepthMeshDisplacement();
                saveSettings();
                updateStatus('DEPTH RESET');
            });

            // Portrait-first Edge Fit
            document.getElementById('btn-edge-fit').addEventListener('click', () => {
                state.edgeFit = !state.edgeFit;
                const fitBtn = document.getElementById('btn-edge-fit');
                fitBtn.setAttribute('aria-pressed', String(state.edgeFit));
                fitBtn.classList.toggle('control-active', state.edgeFit);
                if (state.edgeFit) {
                    preFitCamera = { position: camera.position.clone(), fov: camera.fov, target: controls.target.clone() };
                    const screenHeight = 14 * state.scale;
                    const screenWidth = screenHeight * state.aspectRatio;
                    // Fit the screen symmetrically: keep camera and target at the same
                    // height so the view stays level instead of looking down from above.
                    const viewWidth = Math.max(1, renderer.domElement.clientWidth || window.innerWidth);
                    const viewHeight = Math.max(1, renderer.domElement.clientHeight || window.innerHeight);
                    const margin = viewHeight >= viewWidth ? 1.10 : 1.08;
                    const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov / 2);
                    const actualAspect = viewWidth / viewHeight;
                    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * actualAspect);
                    const verticalDistance = (screenHeight * margin / 2) / Math.tan(verticalHalfFov);
                    const horizontalDistance = (screenWidth * margin / 2) / Math.tan(horizontalHalfFov);
                    const distance = Math.max(verticalDistance, horizontalDistance, 8);
                    // The cinema screen is centered around Y=5 in the original scene.
                    // Keep the fit target aligned with the real screen center on both desktop and mobile.
                    const screenCenterY = 5;
                    camera.position.set(0, screenCenterY, distance);
                    controls.target.set(0, screenCenterY, 0);
                    camera.lookAt(controls.target);
                    controls.update();
                    updateStatus('SYMMETRIC FIT · LEVEL VIEW');
                } else {
                    if (preFitCamera) {
                        camera.position.copy(preFitCamera.position);
                        camera.fov = preFitCamera.fov;
                        camera.updateProjectionMatrix();
                        controls.target.copy(preFitCamera.target);
                        controls.update();
                    }
                    updateStatus('EDGE FIT OFF');
                }
            });

            // Recenter Camera
            document.getElementById('btn-recenter').addEventListener('click', () => {
                camera.position.set(0, state.seatEyeY, state.curDistance);
                camera.lookAt(0, 5, 0);
                controls.target.set(0, 5, 0);
                controls.update();
            });

            // Fullscreen Toggle (standard + mobile browser prefixes, with a visual fallback)
            async function toggleCinemaFullscreen() {
                const root = document.documentElement;
                const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || document.body.classList.contains('cinema-fullscreen-fallback'));
                try {
                    if (!isFullscreen) {
                        const request = root.requestFullscreen || root.webkitRequestFullscreen || root.msRequestFullscreen;
                        if (request) {
                            const result = request.call(root);
                            if (result && typeof result.then === 'function') await result;
                            updateStatus('FULLSCREEN ON');
                        } else {
                            // Some mobile browsers opened from a local HTML file do not expose Fullscreen API.
                            document.body.classList.add('cinema-fullscreen-fallback');
                            updateStatus('CINEMA VIEW ON');
                        }
                        try {
                            if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
                        } catch (_) { /* Orientation lock is optional and browser-dependent. */ }
                    } else {
                        const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
                        if (exit && (document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement)) {
                            const result = exit.call(document);
                            if (result && typeof result.then === 'function') await result;
                        }
                        document.body.classList.remove('cinema-fullscreen-fallback');
                        try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (_) {}
                        updateStatus('FULLSCREEN OFF');
                    }
                } catch (err) {
                    document.body.classList.add('cinema-fullscreen-fallback');
                    updateStatus('CINEMA VIEW ON · BROWSER FULLSCREEN BLOCKED');
                }
                setTimeout(onWindowResize, 150);
            }
            document.getElementById('btn-fullscreen').addEventListener('click', toggleCinemaFullscreen);
            document.addEventListener('fullscreenchange', () => {
                const active = !!document.fullscreenElement;
                if (active) document.body.classList.remove('cinema-fullscreen-fallback');
                setTimeout(onWindowResize, 150);
            });
            document.addEventListener('webkitfullscreenchange', () => setTimeout(onWindowResize, 150));

            // Aspect Ratio Buttons
            document.querySelectorAll('.btn-aspect').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    document.querySelectorAll('.btn-aspect').forEach(b => {
                        b.classList.remove('border-blue-500', 'bg-blue-600/20', 'text-blue-400');
                        b.classList.add('border-transparent', 'text-slate-300');
                    });

                    const targetBtn = e.currentTarget;
                    targetBtn.classList.add('border-blue-500', 'bg-blue-600/20', 'text-blue-400');
                    targetBtn.classList.remove('border-transparent', 'text-slate-300');
                    document.querySelectorAll('.btn-aspect').forEach(b => b.setAttribute('aria-pressed', String(b === targetBtn)));

                    state.aspectRatio = parseFloat(targetBtn.getAttribute('data-ratio'));
                    const sideRatioToggle = document.getElementById('side-ratio-toggle');
                    if (sideRatioToggle) {
                        const ratioLabel = state.aspectRatio >= 1.6 ? '1.90:1' : '1.43:1';
                        sideRatioToggle.querySelector('.tool-label').textContent = 'Aspect ' + ratioLabel;
                        sideRatioToggle.title = 'Aspect Ratio ' + ratioLabel + ' (tap to toggle)';
                        sideRatioToggle.setAttribute('aria-label', 'Current aspect ratio ' + ratioLabel + '. Tap to toggle');
                    }
                    createIMAXScreen();
                    saveSettings();
                });
            });

            // Curvature is hidden behind a dedicated main-screen button; no slider is shown until requested.
            const curvatureToggle = document.getElementById('side-curvature');
            const curvaturePopover = document.getElementById('curvature-popover');
            function setCurvaturePopover(open) {
                curvaturePopover.hidden = !open;
                curvatureToggle.setAttribute('aria-expanded', String(open));
            }
            curvatureToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                setCurvaturePopover(curvaturePopover.hidden);
            });
            curvaturePopover.addEventListener('click', (e) => e.stopPropagation());
            document.addEventListener('click', (e) => {
                if (!curvaturePopover.hidden && !document.getElementById('side-curvature-wrap').contains(e.target)) setCurvaturePopover(false);
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && !curvaturePopover.hidden) { setCurvaturePopover(false); curvatureToggle.focus(); }
            });

            // Continuous curvature
            const sliderCurvature = document.getElementById('slider-curvature');
            function updateCurvatureLabel() {
                const v = state.curvature;
                const label = Math.abs(v) < 0.005 ? 'Flat' : (v < 0 ? 'Convex' : 'Concave');
                const intensity = Math.abs(v) < 0.005 ? '' : (Math.abs(v) < 0.25 ? ' · Low' : Math.abs(v) < 0.55 ? ' · Medium' : ' · Strong');
                document.getElementById('val-curvature').textContent = label + intensity + (Math.abs(v - 0.35) < 0.005 ? ' · Default' : '');
            }
            sliderCurvature.addEventListener('input', (e) => {
                state.curvature = parseFloat(e.target.value);
                updateCurvatureLabel();
                updateBackWallCurvature();
                createIMAXScreen();
                saveSettings();
            });

            // FOV Slider
            const sliderFOV = document.getElementById('slider-fov');
            sliderFOV.addEventListener('input', (e) => {
                state.fov = parseInt(e.target.value);
                document.getElementById('val-fov').textContent = `${state.fov}°`;
                camera.fov = state.fov;
                camera.updateProjectionMatrix();
                saveSettings();
            });

            // Light Intensity Slider
            const sliderLight = document.getElementById('slider-light');
            sliderLight.addEventListener('input', (e) => {
                state.lightIntensity = parseFloat(e.target.value);
                document.getElementById('val-light').textContent = `${Math.round(state.lightIntensity * 100)}%`;
                saveSettings();
            });

            // Numbered seat picker: each seat places the camera at that seat's position.
            const seatPicker = document.getElementById('seat-picker');
            const seatGrid = document.getElementById('seat-grid');
            const seatToggle = document.getElementById('btn-choose-seat');
            const seatLabel = document.getElementById('selected-seat-label');
            seatToggle.addEventListener('click', () => {
                const opening = seatPicker.classList.contains('hidden');
                seatPicker.classList.toggle('hidden', !opening);
                seatToggle.setAttribute('aria-expanded', String(opening));
                document.getElementById('seat-toggle-text').textContent = opening ? 'Hide Seats' : 'Seat No.';
            });
            // 3 rows x 5 seats = 15 individually selectable viewpoints.
            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 5; col++) {
                    const seatNo = row * 5 + col + 1;
                    const seatBtn = document.createElement('button');
                    seatBtn.type = 'button';
                    seatBtn.textContent = String(seatNo);
                    seatBtn.title = `Row ${String.fromCharCode(65 + row)}, Seat ${col + 1}`;
                    seatBtn.className = 'rounded-md py-1 text-[9px] leading-3 border border-slate-700 bg-slate-900 text-slate-300 hover:bg-cyan-600 hover:text-white hover:border-cyan-400 transition';
                    seatBtn.addEventListener('click', () => {
                        // Match the selected camera to the actual modeled seat position.
                        // Front/middle/back rows are at z=9/14/19; five seats span x=-5.5..5.5.
                        const xOffset = (col - 2) * 2.75;
                        const floorY = -5.0 + row * 0.85;
                        const eyeY = floorY + 2.2;
                        const distance = 9.0 + row * 5.0;
                        const screenHeight = 14 * state.scale;
                        const screenWidth = screenHeight * state.aspectRatio;
                        const screenCenterY = screenHeight / 2 - 2;
                        state.seatPreset = 'custom';
                        state.selectedSeatNo = seatNo;
                        state.seatX = xOffset;
                        state.curDistance = distance;
                        state.seatEyeY = eyeY;
                        camera.position.set(xOffset, eyeY, distance);

                        // Fit the complete screen into this seat's view. The center screen
                        // stays its original size; the camera lens adapts to the seat position.
                        // Include the ScreenX wings in the horizontal fit when they are enabled.
                        const viewWidth = state.screenX ? screenWidth * 2.05 : screenWidth;
                        const halfWidthFromSeat = viewWidth / 2 + Math.abs(xOffset);
                        const topExtent = Math.abs((screenCenterY + screenHeight / 2) - eyeY);
                        const bottomExtent = Math.abs((screenCenterY - screenHeight / 2) - eyeY);
                        const halfHeightFromSeat = Math.max(topExtent, bottomExtent);
                        const safeDistance = Math.max(1, distance);
                        const verticalNeed = 2 * Math.atan((halfHeightFromSeat * 1.08) / safeDistance);
                        const horizontalNeedAsVertical = 2 * Math.atan((halfWidthFromSeat * 1.08) / (safeDistance * Math.max(0.3, camera.aspect)));
                        const fittedFov = THREE.MathUtils.radToDeg(Math.max(verticalNeed, horizontalNeedAsVertical));
                        camera.fov = THREE.MathUtils.clamp(fittedFov, 45, 150);
                        state.fov = Math.round(camera.fov);
                        camera.updateProjectionMatrix();
                        document.getElementById('slider-fov').value = Math.round(camera.fov);
                        document.getElementById('val-fov').textContent = `${Math.round(camera.fov)}°`;
                        controls.target.set(0, screenCenterY, 0);
                        camera.lookAt(controls.target);
                        controls.update();
                        updateDepthMeshDisplacement();
                        seatLabel.textContent = `Selected: Row ${String.fromCharCode(65 + row)}, Seat ${col + 1} (Seat ${seatNo})`;
                        seatGrid.querySelectorAll('button').forEach(b => {
                            b.classList.remove('bg-cyan-600', 'text-white', 'border-cyan-400');
                            b.classList.add('bg-slate-900', 'text-slate-300', 'border-slate-700');
                        });
                        seatBtn.classList.remove('bg-slate-900', 'text-slate-300', 'border-slate-700');
                        seatBtn.classList.add('bg-cyan-600', 'text-white', 'border-cyan-400');
                        saveSettings();
                    });
                    seatGrid.appendChild(seatBtn);
                }
            }
            if (state.selectedSeatNo) {
                const restoredSeat = seatGrid.querySelectorAll('button')[state.selectedSeatNo - 1];
                const restoredRow = Math.floor((state.selectedSeatNo - 1) / 5);
                const restoredCol = (state.selectedSeatNo - 1) % 5;
                if (restoredSeat) {
                    restoredSeat.classList.remove('bg-slate-900', 'text-slate-300', 'border-slate-700');
                    restoredSeat.classList.add('bg-cyan-600', 'text-white', 'border-cyan-400');
                    seatLabel.textContent = `Selected: Row ${String.fromCharCode(65 + restoredRow)}, Seat ${restoredCol + 1} (Seat ${state.selectedSeatNo})`;
                }
            }

            document.getElementById('slider-side-light').addEventListener('input', (e) => {
                state.sideWallIntensity = parseFloat(e.target.value);
                document.getElementById('val-side-light').textContent = `${Math.round(state.sideWallIntensity * 100)}%`;
                if (wallGlowLeft) { wallGlowLeft.intensity = state.sideWallIntensity * (state.themeMode === 'glow' ? 3.15 : 0.92); wallGlowRight.intensity = wallGlowLeft.intensity; }
                saveSettings();
            });

            document.getElementById('btn-reset-settings').addEventListener('click', () => {
                state.aspectRatio = 1.43; state.curvature = 0.35; state.sideWallIntensity = 0.35; state.edgeFit = false;
                document.getElementById('btn-edge-fit').setAttribute('aria-pressed', 'false'); document.getElementById('btn-edge-fit').classList.remove('control-active'); preFitCamera = null;
                state.scale = 1.0; state.fov = 65; state.lightIntensity = 0.8; state.themeMode = 'dark'; state.quality = 'medium'; state.depthMode = 'parallax'; state.depthStrength = 0.45; state.glowEnabled = true;
                document.querySelectorAll('.btn-aspect').forEach(b => {
                    const active = parseFloat(b.dataset.ratio) === 1.43;
                    b.classList.toggle('border-blue-500', active); b.classList.toggle('bg-blue-600/20', active); b.classList.toggle('text-blue-400', active);
                    b.classList.toggle('border-transparent', !active); b.classList.toggle('text-slate-300', !active);
                });
                document.getElementById('slider-curvature').value = state.curvature; updateCurvatureLabel(); updateBackWallCurvature();
                document.getElementById('slider-fov').value = 65; document.getElementById('val-fov').textContent = '65°';
                document.getElementById('slider-light').value = 0.8; document.getElementById('val-light').textContent = '80%';
                document.getElementById('slider-side-light').value = 0.35; document.getElementById('val-side-light').textContent = '35%';
                document.getElementById('select-quality').value = 'medium'; applyGraphicsQuality();
                document.getElementById('select-depth-mode').value = 'parallax'; document.getElementById('slider-depth-strength').value = 0.45; document.getElementById('val-depth-strength').textContent = '0.45';
                const resetGlowButton = document.getElementById('btn-glow-toggle'); resetGlowButton.setAttribute('aria-pressed', 'true'); resetGlowButton.querySelector('#glow-toggle-text').textContent = 'Rim Glow: ON'; resetGlowButton.classList.add('bg-indigo-600/20', 'text-indigo-200'); resetGlowButton.classList.remove('text-slate-400'); if (screenRimGlowMesh) screenRimGlowMesh.material.opacity = 0.35;
                camera.fov = 65; camera.updateProjectionMatrix();
                scene.fog.density = 0.018;
                document.getElementById('btn-theme-dark').className = 'glass-panel py-1.5 px-2 rounded-lg text-xs border border-blue-500 text-blue-400 font-medium';
                document.getElementById('btn-theme-glow').className = 'glass-panel py-1.5 px-2 rounded-lg text-xs border border-transparent text-slate-400 hover:text-white';
                state.curDistance = 22; state.seatEyeY = -0.3; state.seatX = 0; state.selectedSeatNo = null; state.seatPreset = 'center';
                document.getElementById('selected-seat-label').textContent = 'No seat selected';
                document.querySelectorAll('#seat-grid button').forEach(b => { b.classList.remove('bg-cyan-600', 'text-white', 'border-cyan-400'); b.classList.add('bg-slate-900', 'text-slate-300', 'border-slate-700'); });
                camera.position.set(state.seatX, state.seatEyeY, state.curDistance);
                controls.target.set(0, 5, 0); controls.update(); updateDepthMeshDisplacement();
                if (wallGlowLeft) { wallGlowLeft.intensity = state.sideWallIntensity * 0.92; wallGlowRight.intensity = state.sideWallIntensity * 0.92; }
                if (state.screenX) setScreenXMode(false); else createIMAXScreen();
                saveSettings();
                updateStatus('SETTINGS RESET · IMAX');
            });

            document.getElementById('select-quality').addEventListener('change', (e) => {
                state.quality = e.target.value;
                applyGraphicsQuality();
                saveSettings();
                updateStatus('QUALITY · ' + state.quality.toUpperCase());
            });
            document.getElementById('btn-theme-dark').addEventListener('click', (e) => {
                state.themeMode = 'dark';
                scene.fog.density = 0.018;
                if (wallGlowLeft) { wallGlowLeft.intensity = state.sideWallIntensity * 0.92; wallGlowRight.intensity = state.sideWallIntensity * 0.92; }
                e.currentTarget.className = "glass-panel py-1.5 px-2 rounded-lg text-xs border border-blue-500 text-blue-400 font-medium";
                document.getElementById('btn-theme-glow').className = "glass-panel py-1.5 px-2 rounded-lg text-xs border border-transparent text-slate-400 hover:text-white";
                saveSettings();
            });

            document.getElementById('btn-theme-glow').addEventListener('click', (e) => {
                state.themeMode = 'glow';
                scene.fog.density = 0.008;
                if (wallGlowLeft) { wallGlowLeft.intensity = state.sideWallIntensity * 3.15; wallGlowRight.intensity = state.sideWallIntensity * 3.15; }
                e.currentTarget.className = "glass-panel py-1.5 px-2 rounded-lg text-xs border border-blue-500 text-blue-400 font-medium";
                document.getElementById('btn-theme-dark').className = "glass-panel py-1.5 px-2 rounded-lg text-xs border border-transparent text-slate-400 hover:text-white";
                saveSettings();
            });
        }

        const SETTINGS_KEY = 'imaxScreenXSettings_v30';
        function restoreSavedSettings() {
            try {
                const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
                if (!saved || typeof saved !== 'object') return;
                if ([1.43, 1.90].includes(Number(saved.aspectRatio))) state.aspectRatio = Number(saved.aspectRatio);
                if (Number.isFinite(Number(saved.curvature))) state.curvature = Math.max(-0.8, Math.min(0.8, Number(saved.curvature)));
                if (Number.isFinite(Number(saved.sideWallIntensity))) state.sideWallIntensity = Math.max(0, Math.min(1.5, Number(saved.sideWallIntensity)));
                if (Number.isFinite(Number(saved.fov))) state.fov = Math.max(45, Math.min(95, Number(saved.fov)));
                if (Number.isFinite(Number(saved.lightIntensity))) state.lightIntensity = Math.max(0, Math.min(2, Number(saved.lightIntensity)));
                if (['dark','glow'].includes(saved.themeMode)) state.themeMode = saved.themeMode;
                if (['low','medium','high'].includes(saved.quality)) state.quality = saved.quality;
                state.screenX = Boolean(saved.screenX);
                if (Number.isFinite(Number(saved.curDistance))) state.curDistance = Math.max(9, Math.min(32, Number(saved.curDistance)));
                if (Number.isFinite(Number(saved.seatEyeY))) state.seatEyeY = Math.max(-3, Math.min(2, Number(saved.seatEyeY)));
                if (Number.isFinite(Number(saved.seatX))) state.seatX = Math.max(-6, Math.min(6, Number(saved.seatX)));
                if (Number.isInteger(Number(saved.selectedSeatNo)) && Number(saved.selectedSeatNo) >= 1 && Number(saved.selectedSeatNo) <= 15) state.selectedSeatNo = Number(saved.selectedSeatNo);

                if (['off','parallax','depthMap','aiVideoDepth'].includes(saved.depthMode)) state.depthMode = saved.depthMode;
                if (Number.isFinite(Number(saved.depthStrength))) state.depthStrength = Number(saved.depthStrength);
                if (typeof saved.glowEnabled === 'boolean') state.glowEnabled = saved.glowEnabled;
            } catch (_) { /* Storage fallback */ }
        }

        function saveSettings() {
            try {
                localStorage.setItem(SETTINGS_KEY, JSON.stringify({
                    aspectRatio: state.aspectRatio, curvature: state.curvature,
                    sideWallIntensity: state.sideWallIntensity, scale: state.scale,
                    fov: state.fov, lightIntensity: state.lightIntensity,
                    themeMode: state.themeMode, quality: state.quality,
                    screenX: state.screenX, curDistance: state.curDistance, seatEyeY: state.seatEyeY, seatX: state.seatX, selectedSeatNo: state.selectedSeatNo,
                    depthMode: state.depthMode, depthStrength: state.depthStrength,
                    glowEnabled: state.glowEnabled
                }));
                const saveStatus = document.getElementById('autosave-status');
                if (saveStatus) saveStatus.innerHTML = '<i class="fa-solid fa-check-circle mr-1"></i>Auto-saved';
            } catch (_) {
                const saveStatus = document.getElementById('autosave-status');
                if (saveStatus) saveStatus.textContent = 'Auto-save unavailable in this browser';
            }
        }

        function syncSettingsUI() {
            document.getElementById('slider-curvature').value = state.curvature;
            document.getElementById('slider-fov').value = state.fov;
            document.getElementById('slider-light').value = state.lightIntensity;
            document.getElementById('slider-side-light').value = state.sideWallIntensity;
            document.getElementById('select-quality').value = state.quality;
            document.getElementById('val-curvature').textContent = Math.abs(state.curvature) < 0.005 ? 'Flat' : (state.curvature > 0 ? 'Concave' : 'Convex');
            document.getElementById('val-fov').textContent = `${state.fov}°`;
            document.getElementById('val-light').textContent = `${Math.round(state.lightIntensity * 100)}%`;
            document.getElementById('val-side-light').textContent = `${Math.round(state.sideWallIntensity * 100)}%`;
            document.querySelectorAll('.btn-aspect').forEach(b => {
                const active = Math.abs(parseFloat(b.dataset.ratio) - state.aspectRatio) < 0.001;
                b.setAttribute('aria-pressed', String(active));
                b.classList.toggle('border-blue-500', active); b.classList.toggle('bg-blue-600/20', active); b.classList.toggle('text-blue-400', active);
                b.classList.toggle('border-transparent', !active); b.classList.toggle('text-slate-300', !active);
            });

            // Sync Depth UI Controls
            document.getElementById('select-depth-mode').value = state.depthMode;
            document.getElementById('slider-depth-strength').value = state.depthStrength;
            document.getElementById('val-depth-strength').textContent = state.depthStrength.toFixed(2);
            const btnGlow = document.getElementById('btn-glow-toggle');
            btnGlow.querySelector('#glow-toggle-text').textContent = state.glowEnabled ? 'Rim Glow: ON' : 'Rim Glow: OFF';
            btnGlow.setAttribute('aria-pressed', String(state.glowEnabled));
            btnGlow.classList.toggle('bg-indigo-600/20', state.glowEnabled);
            btnGlow.classList.toggle('text-indigo-300', state.glowEnabled);
            btnGlow.classList.toggle('text-slate-400', !state.glowEnabled);
        }

        function syncThemeUI() {
            const glow = state.themeMode === 'glow';
            scene.fog.density = glow ? 0.008 : 0.018;
            if (wallGlowLeft) {
                wallGlowLeft.intensity = state.sideWallIntensity * (glow ? 3.15 : 0.92);
                wallGlowRight.intensity = wallGlowLeft.intensity;
            }
            document.getElementById('btn-theme-dark').className = glow
                ? 'glass-panel py-1.5 px-2 rounded-lg text-xs border border-transparent text-slate-400 hover:text-white'
                : 'glass-panel py-1.5 px-2 rounded-lg text-xs border border-blue-500 text-blue-400 font-medium';
            document.getElementById('btn-theme-glow').className = glow
                ? 'glass-panel py-1.5 px-2 rounded-lg text-xs border border-blue-500 text-blue-400 font-medium'
                : 'glass-panel py-1.5 px-2 rounded-lg text-xs border border-transparent text-slate-400 hover:text-white';
        }

        function getQualityPixelRatio(isMobile) {
            const dpr = window.devicePixelRatio || 1;
            if (state.quality === 'low') return Math.min(dpr, isMobile ? 0.7 : 0.85);
            if (state.quality === 'high') return Math.min(dpr, isMobile ? 1.25 : 1.75);
            return Math.min(dpr, isMobile ? 1.0 : 1.35);
        }

        function applyGraphicsQuality() {
            if (!renderer) return;
            const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || window.innerWidth < 700;
            renderer.setPixelRatio(getQualityPixelRatio(mobile));
            renderer.shadowMap.enabled = state.quality === 'high' && !mobile;
            renderer.shadowMap.needsUpdate = true;
            renderer.setSize(window.innerWidth, window.innerHeight);
        }


        function formatTime(seconds) {
            const m = Math.floor(seconds / 60);
            const s = Math.floor(seconds % 60);
            return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
        }

        document.addEventListener('fullscreenchange', () => setTimeout(onWindowResize, 120));

        function onWindowResize() {
            if (!camera || !renderer) return;
            const width = Math.max(1, window.innerWidth);
            const height = Math.max(1, window.innerHeight);
            camera.aspect = width / height;

            // On narrow browser viewports, widen the lens enough to keep the full IMAX
            // screen (and ScreenX wings when enabled) in view instead of cropping the sides.
            const screenHeight = 14 * state.scale;
            const screenWidth = screenHeight * state.aspectRatio * (state.screenX ? 2.05 : 1);
            const distance = Math.max(8, camera.position.distanceTo(controls ? controls.target : new THREE.Vector3(0, 5, 0)));
            const targetY = controls ? controls.target.y : 5;
            const verticalExtent = Math.max(
                Math.abs((screenHeight - targetY) - camera.position.y),
                Math.abs((0 - targetY) - camera.position.y)
            );
            const horizontalExtent = screenWidth / 2 + Math.abs(camera.position.x);
            const verticalFov = 2 * Math.atan((verticalExtent * 1.10) / distance);
            const horizontalFovAsVertical = 2 * Math.atan((horizontalExtent * 1.10) / (distance * Math.max(0.25, camera.aspect)));
            const fitFov = THREE.MathUtils.radToDeg(Math.max(verticalFov, horizontalFovAsVertical));
            camera.fov = THREE.MathUtils.clamp(Math.max(state.fov || 50, fitFov), 45, 150);
            camera.updateProjectionMatrix();

            renderer.setSize(width, height);
            const mobile = width < 700;
            renderer.setPixelRatio(getQualityPixelRatio(mobile));
        }

        window.addEventListener('beforeunload', () => {
            if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
        });

        // --- 8. Animation Loop (quality-preserving) ---
        // Keep the renderer pixel ratio controlled only by the existing Quality setting.
        // Do not dynamically lower render resolution based on FPS.
        function animate(timestamp) {
            requestAnimationFrame(animate);
            if (document.hidden) return; // avoid spending GPU time while the tab is hidden

            const timeSec = (Number.isFinite(timestamp) ? timestamp : performance.now()) * 0.001;

            controls.update();
            updateDynamicAmbilight();
            if (screenRimGlowMesh && spotLight) {
                screenRimGlowMesh.material.color.copy(spotLight.color);
                screenRimGlowMesh.material.opacity = state.glowEnabled
                    ? (0.2 + spotLight.intensity * 0.12)
                    : 0;
            }
            analyzeVideoDepthMap(timestamp);
            if (state.depthMode === 'aiVideoDepth' && videoDepthAnalysisReady) applyPrecomputedVideoDepth();
            updateCinematicEffects(timeSec);

            renderer.render(scene, camera);
        }
    


/* ---- Inline script section 2 ---- */

/* Stable viewport resize: rerender only on settled viewport changes; never accumulate camera zoom. */
(function () {
  let resizeTimer = 0;
  let lastW = 0, lastH = 0;
  function stableViewportResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      const vv = window.visualViewport;
      const w = Math.max(1, Math.round(vv && vv.width ? vv.width : window.innerWidth));
      const h = Math.max(1, Math.round(vv && vv.height ? vv.height : window.innerHeight));
      if (Math.abs(w - lastW) < 2 && Math.abs(h - lastH) < 2) return;
      lastW = w; lastH = h;
      if (typeof onWindowResize === 'function') onWindowResize();
    }, 140);
  }
  window.addEventListener('resize', stableViewportResize, { passive: true });
  window.addEventListener('orientationchange', function () { setTimeout(stableViewportResize, 220); }, { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', stableViewportResize, { passive: true });
  window.addEventListener('load', stableViewportResize, { once: true, passive: true });
})();



/* ---- Inline script section 3 ---- */

(function(){
  function initRequestedUI(){
    const panel=document.getElementById('controls-panel');
    const more=document.querySelector('[data-player-action="more"]');
    const restore=document.getElementById('btn-restore-toolbar');
    const oldHide=document.getElementById('btn-hide-toolbar');
    if(restore) restore.remove();
    if(oldHide) oldHide.remove();
    if(panel){
      panel.classList.remove('translate-x-0');
      panel.classList.add('menu-closed-from-player');
      panel.classList.remove('menu-open-from-player');
    }
    function togglePanel(ev){
      if(ev){ev.preventDefault();ev.stopPropagation();}
      if(!panel) return;
      const open=!panel.classList.contains('menu-open-from-player');
      panel.classList.toggle('menu-open-from-player',open);
      panel.classList.toggle('menu-closed-from-player',!open);
      if(more) more.setAttribute('aria-expanded',String(open));
      if(open) showControlsAndResetTimer();
    }
    if(more){ more.addEventListener('click',togglePanel,true); more.setAttribute('aria-haspopup','dialog'); more.setAttribute('aria-expanded','false'); }
    const close=document.getElementById('btn-close-panel');
    if(close) close.addEventListener('click',function(){
      if(panel){panel.classList.remove('menu-open-from-player');panel.classList.add('menu-closed-from-player');}
      if(more) more.setAttribute('aria-expanded','false');
      showControlsAndResetTimer();
    },true);

    let idleTimer=null;
    function showControlsAndResetTimer(){
      document.body.classList.remove('screen-controls-idle');
      if(idleTimer) clearTimeout(idleTimer);
      idleTimer=setTimeout(function(){
        if(panel && panel.classList.contains('menu-open-from-player')) { showControlsAndResetTimer(); return; }
        const active=document.activeElement;
        if(active && /^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName)) { showControlsAndResetTimer(); return; }
        document.body.classList.add('screen-controls-idle');
      },5000);
    }
    // Any deliberate touch/click/keyboard activity reveals all on-screen keys, then hides them
    // after five seconds of inactivity. Ignore touch pointer-move noise so it cannot keep them visible.
    ['pointerdown','touchstart','click','keydown','input','change'].forEach(function(evt){
      document.addEventListener(evt,function(e){
        if(panel && panel.contains(e.target)) { showControlsAndResetTimer(); return; }
        showControlsAndResetTimer();
      },{capture:true,passive:true});
    });
    document.addEventListener('mousemove',showControlsAndResetTimer,{passive:true});
    document.addEventListener('visibilitychange',function(){if(!document.hidden)showControlsAndResetTimer();});
    showControlsAndResetTimer();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initRequestedUI,{once:true});
  else initRequestedUI();
})();

