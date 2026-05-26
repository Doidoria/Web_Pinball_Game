const Engine = Matter.Engine,
        Runner = Matter.Runner,
        Bodies = Matter.Bodies,
        Body = Matter.Body,
        Composite = Matter.Composite,
        Events = Matter.Events;

let engine, runner;
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: true });

const minimapCanvas = document.getElementById('minimapCanvas');
const minimapCtx = minimapCanvas.getContext('2d');

const MAP_WIDTH = 1200;
const MAP_HEIGHT = 5000; 

let cameraY = 0;
let viewportWidth = window.innerWidth;
let viewportHeight = window.innerHeight;

let marbles = [];
let pegs = [];
let spinners = [];
let trapDoors = [];
let trails = new Map(); 
let isRacing = false;
let winnerDecided = false;
let finishedMarbles = [];

// UI DOM Elements (이 부분이 누락되었었습니다!)
const controlPanel = document.getElementById('control-panel');
const btnTogglePanel = document.getElementById('btn-toggle-panel');
const toggleIcon = document.getElementById('toggle-icon');

const btnChroma = document.getElementById('btn-chroma'); // 수정됨
const btnDrop = document.getElementById('btn-drop');     // 수정됨
const btnReset = document.getElementById('btn-reset');   // 수정됨

let isPanelHidden = false;

const leaderboard = document.getElementById('leaderboard');
const minimapContainer = document.getElementById('minimap-container');

const rank1 = document.getElementById('rank-1');
const rank2 = document.getElementById('rank-2');
const rank3 = document.getElementById('rank-3');
const resultText = document.getElementById('result-text');

const speedSlider = document.getElementById('speed-slider');
const speedVal = document.getElementById('speed-val');
const rankList = document.getElementById('rank-list');

let isChroma = false;
let isDraggingMinimap = false; // 미니맵 드래그

const colors = ['#00f3ff', '#ff003c', '#bc13fe', '#00ff66', '#fffb00', '#ff6600', '#ff00a0', '#0044ff', '#00ffcc', '#ffcc00'];

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    viewportWidth = canvas.width;
    viewportHeight = canvas.height;
}
window.addEventListener('resize', resizeCanvas);

function init() {
    resizeCanvas();
    loadSettings();
    setupPhysics();
    setupEventListeners();
    requestAnimationFrame(renderLoop); 
}

function loadSettings() {
    const savedChroma = localStorage.getItem('epicChromaV2');
    if (savedChroma === 'true') {
        isChroma = true;
        document.body.classList.add('chroma-mode');
    }
}

function saveSettings() {
    localStorage.setItem('epicChromaV2', isChroma);
}

function setupPhysics() {
    engine = Engine.create();
    engine.gravity.y = 1.6; 
    
    const wallOpt = { isStatic: true, friction: 0, restitution: 0.2, render: { visible: false } };
    Composite.add(engine.world, [
        Bodies.rectangle(MAP_WIDTH/2, -1000, MAP_WIDTH, 50, wallOpt), 
        Bodies.rectangle(0, MAP_HEIGHT/2, 50, MAP_HEIGHT + 2000, wallOpt), 
        Bodies.rectangle(MAP_WIDTH, MAP_HEIGHT/2, 50, MAP_HEIGHT + 2000, wallOpt), 
    ]);

    Composite.add(engine.world, [
        Bodies.rectangle(MAP_WIDTH*0.2, 300, MAP_WIDTH*0.6, 30, { isStatic: true, angle: Math.PI * 0.15 }),
        Bodies.rectangle(MAP_WIDTH*0.8, 300, MAP_WIDTH*0.6, 30, { isStatic: true, angle: -Math.PI * 0.15 })
    ]);

    trapDoors = [
        Bodies.rectangle(MAP_WIDTH/2 - 80, 450, 160, 20, { isStatic: true }),
        Bodies.rectangle(MAP_WIDTH/2 + 80, 450, 160, 20, { isStatic: true })
    ];
    Composite.add(engine.world, trapDoors);

    const startY = 700;
    const endY = MAP_HEIGHT - 400;
    let rowIdx = 0;
    
    for (let y = startY; y < endY; y += 95) {
        let cols = (rowIdx % 2 === 0) ? 13 : 12;
        let startX = MAP_WIDTH/2 - ((cols - 1) * 80) / 2;
        
        for (let j = 0; j < cols; j++) {
            if (Math.random() > 0.9) continue; 
            let peg = Bodies.circle(startX + j * 80, y, 9, {
                isStatic: true, restitution: 0.7, friction: 0.05
            });
            pegs.push(peg);
            Composite.add(engine.world, peg);
        }
        
        if (rowIdx > 4 && rowIdx % 5 === 0) {
            let spinner = Bodies.rectangle(MAP_WIDTH/2 + (Math.random()*400-200), y + 45, 260, 20, {
                isStatic: true, restitution: 0.9
            });
            spinners.push(spinner);
            Composite.add(engine.world, spinner);
        }
        rowIdx++;
    }

    const finishLine = Bodies.rectangle(MAP_WIDTH/2, MAP_HEIGHT - 50, MAP_WIDTH, 100, { 
        isStatic: true, isSensor: true, label: 'finishLine'
    });
    Composite.add(engine.world, finishLine);

    Events.on(engine, 'beforeUpdate', () => {
        spinners.forEach((spinner, idx) => {
            const dir = idx % 2 === 0 ? 1 : -1;
            Body.setAngle(spinner, spinner.angle + (0.05 * dir));
        });
    });

    Events.on(engine, 'collisionStart', (event) => {
                event.pairs.forEach((pair) => {
                    if (pair.bodyA.label === 'finishLine' || pair.bodyB.label === 'finishLine') {
                        const marble = pair.bodyA.label === 'finishLine' ? pair.bodyB : pair.bodyA;
                        
                        if (marble.customName && !marble.isFinished) {
                            marble.isFinished = true; // 완주 태그 달기
                            finishedMarbles.push(marble); // 완주 명단에 추가 (순위 기록)
                            
                            // 최초 1등이 들어왔을 때만 슬로우 모션과 우승 연출
                            if (finishedMarbles.length === 1) {
                                triggerSlowMotionFinish();
                                showWinner(marble);
                            }
                            // 완주한 구슬은 물리 맵에서 즉시 제거 (카메라가 남은 구슬을 추적하게 됨)
                            Composite.remove(engine.world, marble);
                        }
                    }
                });
            });

    runner = Runner.create();
    Runner.run(runner, engine);
}

function triggerSlowMotionFinish() {
    engine.timing.timeScale = 0.2; 
    setTimeout(() => {
        engine.timing.timeScale = parseFloat(speedSlider.value); 
    }, 3000);
}

function parseItems() {
    const lines = itemsInput.value.split('\n');
    let result = [];
    let colorIdx = 0;
    lines.forEach(line => {
        const parts = line.trim().split('*');
        const name = parts[0].trim();
        const count = parts.length > 1 ? parseInt(parts[1], 10) : 1;
        if (name && count > 0) {
            const color = colors[colorIdx % colors.length];
            colorIdx++;
            for(let i=0; i<count; i++) result.push({ name, color });
        }
    });
    return result.sort(() => Math.random() - 0.5); 
}

function dropMarbles() {
    if (isRacing) return;
    resetGame();

    if (!modeText.classList.contains('hidden')) {
        syncFromTextarea();
    }
    
    const itemData = parseItems();
    if (itemData.length === 0) return;

    isRacing = true;
    leaderboard.style.opacity = 1;
    minimapContainer.style.opacity = 1;
    
    itemData.forEach((data) => {
        const x = MAP_WIDTH/2 + (Math.random() * 300 - 150);
        const y = -100 - (Math.random() * 500); 
        const marble = Bodies.circle(x, y, 18, {
            restitution: 0.8, friction: 0.001, density: 0.05
        });
        marble.customName = data.name;
        marble.customColor = data.color;
        marbles.push(marble);
        trails.set(marble.id, []); 
        Composite.add(engine.world, marble);
    });

    setTimeout(() => {
        Body.setPosition(trapDoors[0], { x: MAP_WIDTH/2 - 300, y: 450 });
        Body.setPosition(trapDoors[1], { x: MAP_WIDTH/2 + 300, y: 450 });
    }, 2500);
}

function resetGame() {
    marbles.forEach(m => Composite.remove(engine.world, m));
    marbles = [];
    trails.clear();
    isRacing = false;
    finishedMarbles = [];
    winnerDecided = false;
    cameraY = 0;
    engine.timing.timeScale = parseFloat(speedSlider.value);
    
    resultText.style.opacity = 0;
    resultText.style.transform = "translate(-50%, -50%) scale(0.5)";
    leaderboard.style.opacity = 0;
    minimapContainer.style.opacity = 0;
    
    Body.setPosition(trapDoors[0], { x: MAP_WIDTH/2 - 80, y: 450 });
    Body.setPosition(trapDoors[1], { x: MAP_WIDTH/2 + 80, y: 450 });
}

function showWinner(marble) {
    resultText.innerHTML = `<span style="color:${marble.customColor}">${marble.customName}</span><br>우승!!`;
    resultText.style.opacity = 1;
    resultText.style.transform = "translate(-50%, -50%) scale(1)";

    setTimeout(() => {
        resultText.style.opacity = 0;
        resultText.style.transform = "translate(-50%, -50%) scale(0.5)";
    }, 3000);
    
    confetti({ particleCount: 150, angle: 60, spread: 80, origin: { x: 0, y: 0.8 }, colors: colors, zIndex: 9999 });
    confetti({ particleCount: 150, angle: 120, spread: 80, origin: { x: 1, y: 0.8 }, colors: colors, zIndex: 9999 });
}

function updateLeaderboard() {
    if (marbles.length === 0) return null;
    
    // 아직 맵에 남아 뛰고 있는(완주 안 한) 구슬만 필터링
    const activeMarbles = marbles.filter(m => !m.isFinished);
    const sortedActive = [...activeMarbles].sort((a, b) => b.position.y - a.position.y);
    
    rankList.innerHTML = ''; 
    let displayRank = 1;
    
    // 1. 이미 완주한 구슬들 (고정 순위) 먼저 출력
    finishedMarbles.forEach((m) => {
        if (displayRank <= 10) {
            const div = document.createElement('div');
            div.innerHTML = `<span style="color:${m.customColor}; text-shadow: 1px 1px 2px rgba(0,0,0,0.8);">${displayRank}위: ${m.customName} <span class="text-xs text-slate-400 ml-1">(완주)</span></span>`;
            rankList.appendChild(div);
            displayRank++;
        }
    });

    // 2. 남은 레이싱 구슬들 (실시간 순위) 이어서 출력
    for(let i = 0; i < sortedActive.length; i++) {
        if (displayRank <= 10) {
            const m = sortedActive[i];
            const div = document.createElement('div');
            // 아직 달리고 있는 구슬은 살짝 투명하게 표시
            div.innerHTML = `<span style="color:${m.customColor}; opacity: 0.7;">${displayRank}위: ${m.customName}</span>`;
            rankList.appendChild(div);
            displayRank++;
        }
    }

    // 카메라가 쫓아갈 대상 = '남은 달리기 선수 중 1등' 반환
    return sortedActive[0]; 
}

function renderMinimap() {
    minimapCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    
    const scaleX = minimapCanvas.width / MAP_WIDTH;
    const scaleY = minimapCanvas.height / MAP_HEIGHT;

    marbles.forEach(m => {
        const mx = m.position.x * scaleX;
        const my = m.position.y * scaleY;
        minimapCtx.fillStyle = m.customColor;
        minimapCtx.beginPath();
        minimapCtx.arc(mx, my, 3, 0, Math.PI*2);
        minimapCtx.fill();
    });

    // 미니맵 카메라(흰색 박스) 비율도 패널 제외 영역에 맞게 보정
    const panelWidth = isPanelHidden ? 0 : 320;
    const visibleWidth = viewportWidth - panelWidth;
    const zoom = Math.min(visibleWidth / MAP_WIDTH, 1.2); 
    const viewHeight = (viewportHeight / zoom);
    
    const camY = cameraY * scaleY;
    const camH = viewHeight * scaleY;

    minimapCtx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    minimapCtx.lineWidth = 2;
    minimapCtx.strokeRect(0, camY, minimapCanvas.width, camH);
}

function renderLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. 패널 너비(320px)를 제외한 실제 화면 영역 계산 (오른쪽 짤림 방지)
    const panelWidth = isPanelHidden ? 0 : 320;
    const visibleWidth = viewportWidth - panelWidth;
    
    // 2. 줌 비율을 보이는 영역 기준으로 계산
    const zoom = Math.min(visibleWidth / MAP_WIDTH, 1.2); 
    const viewHeight = viewportHeight / zoom; 

    const leader = updateLeaderboard();
    
    if (leader && !isDraggingMinimap) { 
        let targetCameraY = leader.position.y - (viewHeight * 0.6); 
        
        if (targetCameraY < 0) targetCameraY = 0;
        if (targetCameraY > MAP_HEIGHT - viewHeight) targetCameraY = MAP_HEIGHT - viewHeight;
        
        const trackingSpeed = Math.max(0.05, Math.min(0.1 * engine.timing.timeScale, 0.8));
        cameraY += (targetCameraY - cameraY) * trackingSpeed;
    }

    ctx.save();
    ctx.translate((visibleWidth - MAP_WIDTH * zoom) / 2, -cameraY * zoom);
    ctx.scale(zoom, zoom);
    ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
    ctx.fillRect(0, MAP_HEIGHT - 100, MAP_WIDTH, 100); 
    ctx.fillStyle = '#ef4444';
    ctx.font = '900 60px Noto Sans KR';
    ctx.textAlign = 'center';
    ctx.fillText('▼ FINISH LINE ▼', MAP_WIDTH/2, MAP_HEIGHT - 30);

    ctx.fillStyle = isChroma ? '#006600' : '#334155';
    pegs.forEach(p => {
        if (p.position.y > cameraY - 100 && p.position.y < cameraY + (viewportHeight/zoom) + 100) {
            ctx.beginPath();
            ctx.arc(p.position.x, p.position.y, 9, 0, Math.PI*2);
            ctx.fill();
        }
    });

    ctx.fillStyle = '#f59e0b';
    spinners.forEach(s => {
        if (s.position.y > cameraY - 150 && s.position.y < cameraY + (viewportHeight/zoom) + 150) {
            ctx.translate(s.position.x, s.position.y);
            ctx.rotate(s.angle);
            ctx.fillRect(-130, -10, 260, 20);
            ctx.rotate(-s.angle);
            ctx.translate(-s.position.x, -s.position.y);
        }
    });

    ctx.fillStyle = '#ef4444';
    trapDoors.forEach(t => {
        ctx.translate(t.position.x, t.position.y);
        ctx.rotate(t.angle);
        ctx.fillRect(-80, -10, 160, 20);
        ctx.rotate(-t.angle);
        ctx.translate(-t.position.x, -t.position.y);
    });

    marbles.forEach(m => {
        const mTrails = trails.get(m.id);
        mTrails.push({ x: m.position.x, y: m.position.y });
        if (mTrails.length > 12) mTrails.shift(); 

        ctx.globalCompositeOperation = 'screen';
        ctx.beginPath();
        for (let i = 0; i < mTrails.length; i++) ctx.lineTo(mTrails[i].x, mTrails[i].y);
        ctx.strokeStyle = m.customColor;
        ctx.lineWidth = 18;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = 0.5; 
        ctx.stroke();
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'source-over';

        ctx.shadowColor = m.customColor;
        ctx.shadowBlur = 15; 
        
        ctx.beginPath();
        ctx.arc(m.position.x, m.position.y, 18, 0, Math.PI*2);
        ctx.fillStyle = m.customColor;
        ctx.fill();
        
        ctx.shadowBlur = 0; 
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Noto Sans KR';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,1)';
        ctx.shadowBlur = 5;
        let shortName = m.customName.length > 3 ? m.customName.substring(0,2) + '..' : m.customName;
        ctx.fillText(shortName, m.position.x, m.position.y);
        ctx.shadowBlur = 0;
    });

    ctx.restore();

    if(isRacing) renderMinimap();

    requestAnimationFrame(renderLoop);
}

function setupEventListeners() {
    
    btnChroma.addEventListener('click', () => {
        isChroma = !isChroma;
        document.body.classList.toggle('chroma-mode', isChroma);
        saveSettings();
    });
    
    btnDrop.addEventListener('click', dropMarbles);
    btnReset.addEventListener('click', resetGame);

    btnTogglePanel.addEventListener('click', () => {
        isPanelHidden = !isPanelHidden;
        if (isPanelHidden) {
            controlPanel.classList.add('panel-hidden');
            toggleIcon.innerText = '◀';
        } else {
            controlPanel.classList.remove('panel-hidden');
            toggleIcon.innerText = '▶';
        }
    });

    // 속도 조절 슬라이더 이벤트
    speedSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        engine.timing.timeScale = val;
        speedVal.innerText = val.toFixed(1);
    });

    // ==========================================
    // 미니맵 마우스 컨트롤 (클릭 및 드래그로 화면 이동)
    // ==========================================
    const handleMinimapInteraction = (e) => {
        const rect = minimapCanvas.getBoundingClientRect();
        const relativeY = e.clientY - rect.top; // 미니맵 내 마우스 Y 좌표
        const mapRatio = relativeY / minimapCanvas.height; // 0 ~ 1 사이의 비율
        
        // 전체 맵(MAP_HEIGHT) 대비 목표 Y 좌표 계산 (화면 중앙 정렬)
        let targetY = (mapRatio * MAP_HEIGHT) - (viewportHeight / 2);
        
        // 카메라가 맵 경계를 벗어나지 않도록 제한(Clamp)
        targetY = Math.max(0, Math.min(MAP_HEIGHT - viewportHeight, targetY));
        
        // 즉시 카메라 이동 (원한다면 += 로 부드럽게 이동시킬 수도 있음)
        cameraY = targetY; 
    };

    minimapCanvas.addEventListener('mousedown', (e) => {
        isDraggingMinimap = true;
        handleMinimapInteraction(e);
    });

    window.addEventListener('mousemove', (e) => {
        // 마우스를 누른 채로 움직일 때만 작동
        if (isDraggingMinimap) handleMinimapInteraction(e); 
    });

    window.addEventListener('mouseup', () => {
        isDraggingMinimap = false; // 마우스를 떼면 자동 추적 복귀
    });
}

// ==========================================
// 스마트 라인업 매니저 코어 로직
// ==========================================
const smartInput = document.getElementById('smart-input');
const btnAddItem = document.getElementById('btn-add-item');
const visualItemList = document.getElementById('visual-item-list');
const btnClearList = document.getElementById('btn-clear-list');
const totalMarblesText = document.getElementById('total-marbles');

const tabVisual = document.getElementById('tab-visual');
const tabText = document.getElementById('tab-text');
const modeVisual = document.getElementById('mode-visual');
const modeText = document.getElementById('mode-text');
const bulkTextarea = document.getElementById('bulk-textarea');

// 버튼 리스트 -> 텍스트 변환
function syncToTextarea() {
    bulkTextarea.value = lineupData.map(item => `${item.name}*${item.count}`).join(', ');
}

// 텍스트 -> 버튼 리스트 변환 (기존 색상 유지)
function syncFromTextarea() {
    const text = bulkTextarea.value;
    let newData = [];
    const lines = text.split(/[,\n]+/);
    lines.forEach(line => {
        const parts = line.trim().split('*');
        const name = parts[0].trim();
        const count = parts.length > 1 ? parseInt(parts[1], 10) : 1;
        if (name && count > 0) {
            const existing = lineupData.find(item => item.name === name);
            const color = existing ? existing.color : colors[newData.length % colors.length];
            newData.push({ name, count, color });
        }
    });
    lineupData = newData;
    updateVisualList();
    saveSettings();
}

// 탭 클릭 이벤트
tabVisual.addEventListener('click', () => {
    syncFromTextarea();
    modeText.classList.add('hidden');
    modeVisual.classList.remove('hidden');
    tabVisual.className = "flex-1 bg-slate-700 text-white text-xs font-bold py-1.5 rounded shadow";
    tabText.className = "flex-1 text-slate-400 hover:text-white text-xs font-bold py-1.5 rounded transition-colors";
});

tabText.addEventListener('click', () => {
    syncToTextarea();
    modeVisual.classList.add('hidden');
    modeText.classList.remove('hidden');
    tabText.className = "flex-1 bg-slate-700 text-white text-xs font-bold py-1.5 rounded shadow";
    tabVisual.className = "flex-1 text-slate-400 hover:text-white text-xs font-bold py-1.5 rounded transition-colors";
});

let lineupData = []; // [{ name: '치킨', count: 3, color: '#...' }]

// 아이템 추가 로직 (단일 텍스트 및 멀티라인 복붙 완벽 지원)
function addItemsFromText(text) {
    if (!text.trim()) return;
    const lines = text.split(/[,\n]+/); // 쉼표(,)나 엔터(\n) 모두 인식
    
    lines.forEach(line => {
        const parts = line.trim().split('*');
        const name = parts[0].trim();
        const count = parts.length > 1 ? parseInt(parts[1], 10) : 1;
        
        if (name && count > 0) {
            const existing = lineupData.find(item => item.name === name);
            if (existing) {
                existing.count += count; // 이미 있으면 개수만 증가 (자동 병합)
            } else {
                // 새 항목 생성 시 랜덤 색상 부여
                const color = colors[lineupData.length % colors.length];
                lineupData.push({ name, count, color });
            }
        }
    });
    
    smartInput.value = ''; // 입력창 비우기
    updateVisualList();
    saveSettings();
}

// 지분(개수) 변경 로직
function changeItemCount(index, delta) {
    lineupData[index].count += delta;
    if (lineupData[index].count <= 0) {
        lineupData.splice(index, 1); // 0개가 되면 삭제
    }
    updateVisualList();
    saveSettings();
}

// 직접 숫자 입력 처리 함수
window.setItemCount = function(index, value) {
    let newVal = parseInt(value, 10);
    if (isNaN(newVal) || newVal <= 0) {
        lineupData.splice(index, 1); // 0 이하로 입력하면 삭제
    } else {
        lineupData[index].count = newVal;
    }
    updateVisualList();
    saveSettings();
};

// 리스트 UI 실시간 렌더링
function updateVisualList() {
    visualItemList.innerHTML = '';
    let total = 0;

    lineupData.forEach((item, index) => {
        total += item.count;
        const div = document.createElement('div');
        div.className = "flex justify-between items-center bg-slate-700/50 p-2 rounded border border-slate-600";
        
        div.innerHTML = `
            <div class="flex items-center gap-2 overflow-hidden">
                <span class="w-3 h-3 rounded-full shadow-sm" style="background-color: ${item.color}"></span>
                <span class="text-sm font-bold text-slate-200 truncate">${item.name}</span>
            </div>
            <div class="flex items-center gap-1 bg-slate-900 rounded p-1">
                <button onclick="changeItemCount(${index}, -1)" class="w-6 h-6 flex justify-center items-center text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors">-</button>
                
                <input type="number" min="0" value="${item.count}" onchange="setItemCount(${index}, this.value)" class="text-xs font-black text-blue-300 bg-transparent w-10 text-center focus:outline-none focus:bg-slate-800 rounded transition-colors">
                
                <button onclick="changeItemCount(${index}, 1)" class="w-6 h-6 flex justify-center items-center text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors">+</button>
            </div>
        `;
        visualItemList.appendChild(div);
    });

    totalMarblesText.innerText = `총 ${total}개`;
}

// 구슬 드롭용 파싱 함수 오버라이딩 (기존 함수 덮어쓰기)
window.parseItems = function() {
    let result = [];
    lineupData.forEach(item => {
        for(let i=0; i<item.count; i++) {
            result.push({ name: item.name, color: item.color });
        }
    });
    return result.sort(() => Math.random() - 0.5); // 무작위 섞기
};

// 스마트 매니저 이벤트 리스너
btnAddItem.addEventListener('click', () => addItemsFromText(smartInput.value));
smartInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addItemsFromText(smartInput.value);
});

// 붙여넣기(Paste) 이벤트 가로채기 (메모장 복붙 완벽 지원)
smartInput.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasteData = (e.clipboardData || window.clipboardData).getData('text');
    addItemsFromText(pasteData);
});

btnClearList.addEventListener('click', () => {
    if(confirm('라인업을 전체 삭제하시겠습니까?')) {
        lineupData = [];
        updateVisualList();
        saveSettings();
    }
});

// 로컬 스토리지 데이터 마이그레이션 및 로드 수정
const originalLoadSettings = window.loadSettings;
window.loadSettings = function() {
    if (originalLoadSettings) originalLoadSettings(); // 배경 설정 등 기존 설정 로드
    
    const savedLineup = localStorage.getItem('epicLineupData');
    if (savedLineup) {
        lineupData = JSON.parse(savedLineup);
    } else {
        // 초기 기본 데이터
        lineupData = [
            { name: '꽝', count: 10, color: colors[0] },
            { name: '치킨', count: 2, color: colors[1] },
            { name: '피자', count: 1, color: colors[2] }
        ];
    }
    updateVisualList();
};

const originalSaveSettings = window.saveSettings;
window.saveSettings = function() {
    if (originalSaveSettings) originalSaveSettings();
    localStorage.setItem('epicLineupData', JSON.stringify(lineupData));
};

init();