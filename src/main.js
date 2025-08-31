import * as THREE from 'three'
import { OrbitControls } from '../vendor/three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from '../vendor/three/examples/jsm/renderers/CSS2DRenderer.js'

// ======= Scena / kamera / renderery =======
const app = document.getElementById('app')
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x0b0f14)

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100)
camera.position.set(5, 4, 6)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
app.appendChild(renderer.domElement)

const labelRenderer = new CSS2DRenderer()
labelRenderer.setSize(window.innerWidth, window.innerHeight)
labelRenderer.domElement.style.position = 'fixed'
labelRenderer.domElement.style.inset = '0'
labelRenderer.domElement.style.pointerEvents = 'none'
labelRenderer.domElement.style.zIndex = '5'
document.body.appendChild(labelRenderer.domElement)

// Światło
scene.add(new THREE.AmbientLight(0xffffff, 0.75))
const dir = new THREE.DirectionalLight(0xffffff, 1.0)
dir.position.set(5, 8, 6)
scene.add(dir)

// Kamera: OrbitControls
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.08
controls.rotateSpeed = 0.9
controls.panSpeed = 0.6

scene.fog = new THREE.Fog(0x0b0f14, 16, 30)

// Mobile: oddal główną kamerę o ~40% tylko w trybie pełnej kostki
const MOBILE_FACTOR = 1.4
const BASE_CAM_LEN = camera.position.length()
let camMobileApplied = null // null = nieustalone, true = mobile zastosowane, false = desktop
function applyMainCameraDistance(force = false) {
  const isMobile = window.matchMedia('(max-width: 640px)').matches
  if (!force && camMobileApplied === isMobile) return
  const targetLen = isMobile ? BASE_CAM_LEN * MOBILE_FACTOR : BASE_CAM_LEN
  camera.position.setLength(targetLen)
  camera.updateProjectionMatrix()
  camMobileApplied = isMobile
}
// Zastosuj na starcie i przy zmianie rozmiaru
applyMainCameraDistance(true)
window.addEventListener('resize', () => applyMainCameraDistance())

// Hamburger menu (mobile): toggles #ui visibility
const menuToggle = document.getElementById('menuToggle')
const uiPanel = document.getElementById('ui')
if (menuToggle && uiPanel) {
	menuToggle.addEventListener('click', () => {
		const open = !uiPanel.classList.contains('open')
		uiPanel.classList.toggle('open', open)
		menuToggle.setAttribute('aria-expanded', String(open))
	})

	// Helpers to close panel on mobile
	const isMobile = () => window.matchMedia('(max-width: 640px)').matches
	const closeUi = () => {
		if (!uiPanel.classList.contains('open')) return
		uiPanel.classList.remove('open')
		menuToggle.setAttribute('aria-expanded', 'false')
	}
	// Close after clicking any actionable control inside panel (buttons/links)
	uiPanel.addEventListener('click', e => {
		if (!isMobile()) return
		const actionable = e.target && (e.target.closest('button, a') || null)
		if (actionable) closeUi()
	})
	// Close when clicking outside the panel (backdrop area)
	document.addEventListener('click', e => {
		if (!isMobile()) return
		if (!uiPanel.classList.contains('open')) return
		const clickedInside = uiPanel.contains(e.target)
		const clickedToggle = menuToggle.contains(e.target)
		if (!clickedInside && !clickedToggle) closeUi()
	})
	// Close with Escape
	window.addEventListener('keydown', e => {
		if (!isMobile()) return
		if (e.key === 'Escape') closeUi()
	})
}

// ======= Model kostki =======
const CUBE_SIZE = 3
const TILE = 1
const GAP = 0.06
const TILE_SIZE = TILE - GAP

const FACE_COLORS = { U: 0xffffff, D: 0xffea00, F: 0x00a650, B: 0x1e90ff, R: 0xcc0000, L: 0xfe7f00 }

const core = new THREE.Mesh(
	new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE),
	new THREE.MeshStandardMaterial({ color: 0x111318, metalness: 0.2, roughness: 0.9 })
)
scene.add(core)

const faces = [
	{ name: 'U', normal: new THREE.Vector3(0, 1, 0), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, -1) },
	{ name: 'D', normal: new THREE.Vector3(0, -1, 0), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1) },
	{ name: 'F', normal: new THREE.Vector3(0, 0, 1), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0) },
	{ name: 'B', normal: new THREE.Vector3(0, 0, -1), u: new THREE.Vector3(-1, 0, 0), v: new THREE.Vector3(0, 1, 0) },
	{ name: 'R', normal: new THREE.Vector3(1, 0, 0), u: new THREE.Vector3(0, 0, -1), v: new THREE.Vector3(0, 1, 0) },
	{ name: 'L', normal: new THREE.Vector3(-1, 0, 0), u: new THREE.Vector3(0, 0, 1), v: new THREE.Vector3(0, 1, 0) },
]

const stickerMeshes = []
const labelMap = new Map()
const dotMap = new Map()
const DISABLED_TILES = new Set(['U5', 'R7', 'U6', 'L6', 'B8']) // jak w Twojej wersji
const DOT_BLOCKED = new Set(DISABLED_TILES)
const CENTER_IDS = new Set(['U4', 'D4', 'F4', 'B4', 'R4', 'L4'])

// ======= Persistencja =======
const STORAGE_KEY = 'rubik_labels_v1'
function loadLabels() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		return raw ? JSON.parse(raw) : {}
	} catch {
		return {}
	}
}
function saveLabels(obj) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
	} catch {}
}
let labels = loadLabels()

// ======= Tworzenie naklejek =======
const tileGeom = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE)
let _disabledLabelsCleared = false

faces.forEach(face => {
	const color = FACE_COLORS[face.name]
	for (let row = 0; row < 3; row++) {
		for (let col = 0; col < 3; col++) {
			const idx = row * 3 + col
			const id = `${face.name}${idx}`
			const u = (col - 1) * TILE
			const v = (row - 1) * TILE
			const center = new THREE.Vector3()
				.addScaledVector(face.normal, CUBE_SIZE / 2 + 0.001)
				.addScaledVector(face.u, u)
				.addScaledVector(face.v, v)

			// Naklejki w głównej scenie: użyj materiału nieoświetlanego, jak w mini‑treningu,
			// aby kolory były spójne niezależnie od świateł.
			const mat = new THREE.MeshBasicMaterial({ color })
			if (DISABLED_TILES.has(id)) mat.color.multiplyScalar(0.18) // przyciemnienie buforów
			const tile = new THREE.Mesh(tileGeom, mat)
			tile.position.copy(center)
			tile.lookAt(center.clone().add(face.normal))
			const isCenter = idx === 4
			tile.userData = { id, face: face.name, idx, center: isCenter, disabled: DISABLED_TILES.has(id) || isCenter }
			scene.add(tile)
			stickerMeshes.push(tile)

			const div = document.createElement('div')
			div.className = 'label'
			// Czarny kolor liter na białych (U) i żółtych (D) polach, aby były czytelne
			if (face.name === 'U' || face.name === 'D') {
				div.style.color = '#000000'
				div.style.textShadow = 'none'
			}
			if ((DISABLED_TILES.has(id) || isCenter) && labels[id]) {
				delete labels[id]
				_disabledLabelsCleared = true
			}
			div.textContent = labels[id] || ''
			const label = new CSS2DObject(div)
			label.position.set(0, 0, 0.002)
			tile.add(label)
			if (!div.textContent) label.element.style.display = 'none'
			labelMap.set(id, label)

			if (idx !== 4 && !DOT_BLOCKED.has(id)) {
				const dotGeom = new THREE.CircleGeometry(0.055, 24)
				const dotMat = new THREE.MeshBasicMaterial({
					// Czarne kropki na białych (U) i żółtych (D) polach; w innych białe
					color: face.name === 'U' || face.name === 'D' ? 0x000000 : 0xffffff,
					depthTest: true,
					transparent: true,
					opacity: 0.9,
				})
				const dot = new THREE.Mesh(dotGeom, dotMat)
				dot.position.set(0, 0, 0.012)
				dot.renderOrder = 1
				tile.add(dot)
				dotMap.set(id, dot)
			}
		}
	}
})

if (_disabledLabelsCleared) saveLabels(labels)

// Krawędzie
const edges = new THREE.LineSegments(
	new THREE.EdgesGeometry(new THREE.BoxGeometry(CUBE_SIZE + 0.001, CUBE_SIZE + 0.001, CUBE_SIZE + 0.001)),
	new THREE.LineBasicMaterial({ color: 0x1f2937 })
)
scene.add(edges)

// ======= Interakcje =======
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
let lastHover = null

function setPointerFromEvent(ev) {
	const rect = renderer.domElement.getBoundingClientRect()
	const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
	const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
	pointer.set(x, y)
}
function pick(ev) {
	setPointerFromEvent(ev)
	raycaster.setFromCamera(pointer, camera)
	const hits = raycaster.intersectObjects(stickerMeshes, false)
	return hits.length ? hits[0].object : null
}
// Modal wprowadzania litery (Promise)
function openLetterModal(stickerId, defaultValue = '') {
	const modal = document.getElementById('letterModal')
	const title = document.getElementById('letterModalTitle')
	const input = document.getElementById('letterModalInput')
	const okBtn = document.getElementById('letterModalOk')
	const cancelBtn = document.getElementById('letterModalCancel')

	// Ustal tytuł z notacją Singmaster, jeśli dostępna
	const sing =
		typeof STICKER_TO_SINGMASTER !== 'undefined' && STICKER_TO_SINGMASTER[stickerId]
			? STICKER_TO_SINGMASTER[stickerId]
			: stickerId
	title.textContent = `Litera dla pola ${sing}`
	input.value = (defaultValue || '').toUpperCase()
	input.select()

	modal.classList.add('open')
	modal.setAttribute('aria-hidden', 'false')

	return new Promise(resolve => {
		let done = false
		const finish = val => {
			if (done) return
			done = true
			// sprzątanie
			modal.classList.remove('open')
			modal.setAttribute('aria-hidden', 'true')
			okBtn.removeEventListener('click', onOk)
			cancelBtn.removeEventListener('click', onCancel)
			modal.removeEventListener('click', onBackdrop)
			window.removeEventListener('keydown', onKey)
			resolve(val)
		}
		const onOk = () => {
			const v = (input.value || '').trim().toUpperCase()
			// Zwróć nawet pusty string (oznacza usuń), ale tylko po OK
			finish(v)
		}
		const onCancel = () => finish(null)
		const onBackdrop = e => {
			if (e.target === modal) onCancel()
		}
		const onKey = e => {
			if (e.key === 'Escape') onCancel()
			if (e.key === 'Enter') onOk()
		}
		okBtn.addEventListener('click', onOk)
		cancelBtn.addEventListener('click', onCancel)
		modal.addEventListener('click', onBackdrop)
		window.addEventListener('keydown', onKey)
		// wymuś uppercase na bieżąco
		input.addEventListener('input', () => {
			input.value = (input.value || '').toUpperCase().slice(0, 1)
		})
		setTimeout(() => input.focus(), 0)
	})
}
function showToast(msg, ms = 1200) {
	const toast = document.getElementById('toast')
	toast.textContent = msg
	// Zresetuj animację i uruchom delikatny pop‑in
	toast.style.animation = 'none'
	// pokaż i wymuś reflow, aby animacja zadziałała za każdym razem
	toast.style.display = 'block'
	// eslint-disable-next-line no-unused-expressions
	void toast.offsetHeight
	toast.style.animation = 'toast-pop 180ms ease-out'
	clearTimeout(showToast._t)
	showToast._t = setTimeout(() => (toast.style.display = 'none'), ms)
}
function handleMove(ev) {
	const hit = pick(ev)
	if (hit !== lastHover) {
		if (lastHover) lastHover.scale.set(1, 1, 1)
		if (hit) hit.scale.set(1.05, 1.05, 1.05)
		lastHover = hit
	}
}
renderer.domElement.addEventListener('mousemove', handleMove)

async function handleClick(ev) {
	const tile = pick(ev)
	if (!tile) return
	const { id } = tile.userData
	const mode = document.getElementById('mode').value
	if (mode === 'edit') {
		if (tile.userData.disabled) {
			showToast(tile.userData.center ? 'Nie można ustawić litery na środku.' : 'To pole jest buforem.')
			return
		}
		const current = labels[id] || ''
		const val = await openLetterModal(id, current)
		if (val === null) return
		const clean = (val || '').trim().toUpperCase()
		if (clean) labels[id] = clean
		else delete labels[id]
		saveLabels(labels)
		labelMap.get(id).element.textContent = clean
		updateLabelsVisibility()
	} else {
		const target = (labels[id] || '').toUpperCase()
		if (!target) {
			showToast(`Dla ${id} nie ustawiono litery.`)
			return
		}
		const guessRaw = await openLetterModal(id, '')
		if (guessRaw === null) return
		const guess = (guessRaw || '').trim().toUpperCase()
		showToast(guess === target ? '✅ Dobrze!' : `❌ Nie. Poprawna: ${target}`, 2000)
	}
}
renderer.domElement.addEventListener('click', handleClick)

const toggle = document.getElementById('toggleLetters')
const _tmpPos = new THREE.Vector3()
const _tmpDir = new THREE.Vector3()
const _toCam = new THREE.Vector3()

function updateLabelsVisibility() {
	const showLetters = toggle.checked
	for (const tile of stickerMeshes) {
		const id = tile.userData.id
		const lbl = labelMap.get(id)
		if (!lbl) continue
		const hasText = !!lbl.element.textContent

		let facing = false
		if (hasText && showLetters) {
			tile.getWorldPosition(_tmpPos)
			tile.getWorldDirection(_tmpDir)
			_toCam.copy(camera.position).sub(_tmpPos).normalize()
			facing = _tmpDir.dot(_toCam) > 0.05
		}
		const show = !!(showLetters && hasText && facing && !tile.userData.disabled)
		lbl.visible = show
		lbl.element.style.display = show ? 'block' : 'none'
	}
	// kropki: tylko dla pustych pól i gdy literki ukryte
	dotMap.forEach((dot, id) => {
		const lbl = labelMap.get(id)
		const hasText = !!(lbl && lbl.element.textContent)
		dot.visible = !showLetters && !hasText
	})
}
toggle.addEventListener('change', updateLabelsVisibility)

// Reset / eksport / import
document.getElementById('reset').addEventListener('click', () => {
	if (!confirm('Na pewno usunąć wszystkie literki?')) return
	labels = {}
	saveLabels(labels)
	labelMap.forEach(lbl => (lbl.element.textContent = ''))
	updateLabelsVisibility()
	showToast('Wyczyszczono.')
})
document.getElementById('export').addEventListener('click', () => {
	const data = JSON.stringify(labels, null, 2)
	const blob = new Blob([data], { type: 'application/json' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = 'rubik_labels.json'
	a.click()
	URL.revokeObjectURL(url)
})
document.getElementById('import').addEventListener('click', () => {
	const input = document.createElement('input')
	input.type = 'file'
	input.accept = '.json,application/json'
	input.onchange = () => {
		const file = input.files && input.files[0]
		if (!file) return
		const reader = new FileReader()
		reader.onload = () => {
			try {
				labels = JSON.parse(String(reader.result || '{}')) || {}
				let changed = false
				for (const id of Object.keys(labels)) {
					if (DISABLED_TILES.has(id) || CENTER_IDS.has(id)) {
						delete labels[id]
						changed = true
					}
				}
				saveLabels(labels)
				labelMap.forEach((lbl, id) => {
					lbl.element.textContent = labels[id] || ''
				})
				updateLabelsVisibility()
				showToast('Zaimportowano.')
			} catch {
				alert('Nieprawidłowy plik JSON')
			}
		}
		reader.readAsText(file)
	}
	input.click()
})

// Resize + pętla
function onResize() {
	camera.aspect = window.innerWidth / window.innerHeight
	camera.updateProjectionMatrix()
	renderer.setSize(window.innerWidth, window.innerHeight)
	labelRenderer.setSize(window.innerWidth, window.innerHeight)
}
window.addEventListener('resize', onResize)

// Aktualizuj widoczność liter przy ruchu kamery i zmianie rozmiaru
controls.addEventListener('change', updateLabelsVisibility)
window.addEventListener('resize', updateLabelsVisibility)

function tick() {
	controls.update()
	renderer.render(scene, camera)
	labelRenderer.render(scene, camera)
	requestAnimationFrame(tick)
}
// Inicjalna synchronizacja widoczności
updateLabelsVisibility()
tick()

// ================== Mini‑scena: trening pojedynczego elementu (tylko tryb na miejscu) ==================
// DOM elementy (przyciski uruchamiające trener na miejscu)
const btnOpenEdge = document.getElementById('openEdgePieceQuiz')
const btnOpenCorner = document.getElementById('openCornerPieceQuiz')

let mini = null // (nieużywane już: dawna mini‑scena modalowa)

// Bazy wektorów i pomocnicze funkcje do mapowania płytek
const faceByName = new Map(faces.map(f => [f.name, f]))
const EPS = 1e-6

function vecEquals(a, b) {
	return Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS && Math.abs(a.z - b.z) < EPS
}

function findFaceByNormal(n) {
	return faces.find(f => vecEquals(f.normal, n))
}

function tileCenterFor(face, row, col) {
	const u = (col - 1) * TILE
	const v = (row - 1) * TILE
	return new THREE.Vector3()
		.addScaledVector(face.normal, CUBE_SIZE / 2 + 0.001)
		.addScaledVector(face.u, u)
		.addScaledVector(face.v, v)
}

function indexFor(face, pos) {
	const u = Math.round(pos.clone().dot(face.u) / TILE)
	const v = Math.round(pos.clone().dot(face.v) / TILE)
	const col = THREE.MathUtils.clamp(u, -1, 1) + 1
	const row = THREE.MathUtils.clamp(v, -1, 1) + 1
	return row * 3 + col
}

function neighborFacesFor(face, row, col) {
	// Zwraca listę 0..2 sąsiadów (dla krawędzi 1, dla rogu 2) jako obiekty { face, row, col, id }
	const uCoord = col - 1
	const vCoord = row - 1
	const center = tileCenterFor(face, row, col)
	const res = []
	if (uCoord === 0 && vCoord === 0) return res // środek – brak sąsiadów
	if (uCoord !== 0 && vCoord !== 0) {
		// róg – dwie ściany
		const n1 = face.v.clone().multiplyScalar(-Math.sign(vCoord))
		const f1 = findFaceByNormal(n1)
		if (f1) {
			const idx1 = indexFor(f1, center)
			res.push({ face: f1, row: Math.floor(idx1 / 3), col: idx1 % 3, id: `${f1.name}${idx1}` })
		}
		const n2 = face.u.clone().multiplyScalar(Math.sign(uCoord))
		const f2 = findFaceByNormal(n2)
		if (f2) {
			const idx2 = indexFor(f2, center)
			res.push({ face: f2, row: Math.floor(idx2 / 3), col: idx2 % 3, id: `${f2.name}${idx2}` })
		}
	} else {
		// krawędź – jedna ściana
		let n
		if (uCoord === 0) n = face.v.clone().multiplyScalar(-Math.sign(vCoord))
		else n = face.u.clone().multiplyScalar(Math.sign(uCoord))
		const fn = findFaceByNormal(n)
		if (fn) {
			const idx = indexFor(fn, center)
			res.push({ face: fn, row: Math.floor(idx / 3), col: idx % 3, id: `${fn.name}${idx}` })
		}
	}
	return res
}

function computePieces() {
	const edgeSet = new Set()
	const cornerSet = new Set()
	const EDGES = []
	const CORNERS = []

	faces.forEach(f => {
		for (let row = 0; row < 3; row++) {
			for (let col = 0; col < 3; col++) {
				const idx = row * 3 + col
				const id0 = `${f.name}${idx}`
				const uCoord = col - 1
				const vCoord = row - 1
				if (uCoord === 0 && vCoord === 0) continue // środek
				const neigh = neighborFacesFor(f, row, col)
				if (uCoord === 0 || vCoord === 0) {
					// krawędź: 1 sąsiad
					if (neigh.length !== 1) continue
					const ids = [id0, neigh[0].id].sort().join('+')
					if (!edgeSet.has(ids)) {
						edgeSet.add(ids)
						EDGES.push(ids.split('+'))
					}
				} else {
					// róg: 2 sąsiedzi
					if (neigh.length !== 2) continue
					const ids = [id0, neigh[0].id, neigh[1].id].sort().join('+')
					if (!cornerSet.has(ids)) {
						cornerSet.add(ids)
						CORNERS.push(ids.split('+'))
					}
				}
			}
		}
	})
	return { EDGES, CORNERS }
}

// 📌 Mapowanie stickerId (np. U0..L8) → oficjalna notacja Singmaster
const STICKER_TO_SINGMASTER = {
	// ---- FRONT ----
	F0: 'ULF',
	F1: 'UF',
	F2: 'URF',
	F3: 'LF',
	F4: 'F',
	F5: 'RF',
	F6: 'DLF',
	F7: 'DF',
	F8: 'DRF',

	// ---- BACK ----
	B0: 'URB',
	B1: 'UB',
	B2: 'ULB',
	B3: 'RB',
	B4: 'B',
	B5: 'LB',
	B6: 'DRB',
	B7: 'DB',
	B8: 'DLB',

	// ---- UP ----
	U0: 'ULB',
	U1: 'UB',
	U2: 'URB',
	U3: 'UL',
	U4: 'U',
	U5: 'UR',
	U6: 'ULF',
	U7: 'UF',
	U8: 'URF',

	// ---- DOWN ----
	D0: 'DLF',
	D1: 'DF',
	D2: 'DRF',
	D3: 'DL',
	D4: 'D',
	D5: 'DR',
	D6: 'DLB',
	D7: 'DB',
	D8: 'DRB',

	// ---- LEFT ----
	L0: 'ULF',
	L1: 'UL',
	L2: 'ULB',
	L3: 'LF',
	L4: 'L',
	L5: 'LB',
	L6: 'DLF',
	L7: 'DL',
	L8: 'DLB',

	// ---- RIGHT ----
	R0: 'URB',
	R1: 'UR',
	R2: 'URF',
	R3: 'RB',
	R4: 'R',
	R5: 'RF',
	R6: 'DRB',
	R7: 'DR',
	R8: 'DRF',
}

// Budowa pojedynczego elementu (mini‑kosteczka z naklejkami)
function buildEdgePiece({ name, stickers }) {
	return buildPieceGroup({ name, stickers })
}
function buildCornerPiece({ name, stickers }) {
	return buildPieceGroup({ name, stickers })
}

function buildPieceGroup({ name, stickers }) {
	const group = new THREE.Group()
	group.name = name
	// mały korpus
	const size = 0.8
	const half = size / 2
	const core = new THREE.Mesh(
		new THREE.BoxGeometry(size, size, size),
		new THREE.MeshStandardMaterial({ color: 0x12161d, metalness: 0.2, roughness: 0.8 })
	)
	group.add(core)
	// naklejki bez etykiet 2D
	// Delikatnie większe naklejki, aby zmniejszyć czarną ramkę wokół koloru
	const stickerGeom = new THREE.PlaneGeometry(0.74, 0.74)
	stickers.forEach(id => {
		const faceName = id[0]
		const basis = faceByName.get(faceName)
		if (!basis) return
		const col = FACE_COLORS[faceName]
		const mat = new THREE.MeshBasicMaterial({ color: col })
		const m = new THREE.Mesh(stickerGeom, mat)
		// Minimalnie większy offset, by uniknąć z-fightingu przy większej naklejce
		const pos = basis.normal.clone().multiplyScalar(half + 0.012)
		m.position.copy(pos)
		// skieruj płaszczyznę na zewnątrz
		const look = pos.clone().add(basis.normal)
		m.lookAt(look)
		group.add(m)
	})
	return group
}

// Ustaw orientację elementu tak, aby średnia normalna jego naklejek była skierowana do kamery
function orientGroupToCamera(group, stickers, camera) {
	const avg = new THREE.Vector3()
	for (const id of stickers) {
		const faceName = id[0]
		const basis = faceByName.get(faceName)
		if (basis) avg.add(basis.normal)
	}
	if (avg.lengthSq() === 0) return
	avg.normalize()
	const toCam = camera.position.clone().normalize()
	const q = new THREE.Quaternion().setFromUnitVectors(avg, toCam)
	group.quaternion.premultiply(q)
}

// Podpięcie przycisków (uruchamiają trener na miejscu)
if (btnOpenEdge) btnOpenEdge.addEventListener('click', () => startPieceTrainer('edge'))
if (btnOpenCorner) btnOpenCorner.addEventListener('click', () => startPieceTrainer('corner'))
// Globalny przycisk powrotu do pełnej kostki
const openFullCubeBtn2 = document.getElementById('openFullCube')
if (openFullCubeBtn2) openFullCubeBtn2.addEventListener('click', stopPieceTrainer)

// ================== Trener bez modala (zamiana sceny głównej) ==================
const trainerUI = document.getElementById('pieceTrainerUI')
const trainerFields = document.getElementById('pieceTrainerFields')
const trainerCheck = document.getElementById('checkPieceAnswers')
const trainerNext = document.getElementById('nextPieceTrainer')
const openFullCubeBtn = document.getElementById('openFullCube')

let trainer = null

function startPieceTrainer(kind) {
	// Jeśli trener już działa (np. zmiana trybu krawędź/róg), zamknij go najpierw
	if (trainer) {
		stopPieceTrainer()
	}
	// ukryj główny renderer i etykiety
	renderer.domElement.style.display = 'none'
	if (labelRenderer && labelRenderer.domElement) labelRenderer.domElement.style.display = 'none'
	// pokaż panel formularza
	trainerUI.classList.add('open')
	trainerUI.setAttribute('aria-hidden', 'false')

	// mini scena w #app
	const tScene = new THREE.Scene()
	tScene.background = new THREE.Color(0x0b0f14)
	const w = window.innerWidth
	const h = window.innerHeight
	const tCamera = new THREE.PerspectiveCamera(45, w / h, 0.1, 50)
	// Dalej ~x1.43 (ok. 30% mniejszy obraz elementu)
	tCamera.position.set(3.58, 3.15, 3.86)
	const tRenderer = new THREE.WebGLRenderer({ antialias: true })
	tRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
	tRenderer.setSize(w, h)
	// umieść na #app
	app.appendChild(tRenderer.domElement)
	const tControls = new OrbitControls(tCamera, tRenderer.domElement)
	tControls.enableDamping = true

	// światło
	tScene.add(new THREE.AmbientLight(0xffffff, 0.9))
	const dl = new THREE.DirectionalLight(0xffffff, 0.8)
	dl.position.set(3, 4, 2)
	tScene.add(dl)

	let group = null
	const { EDGES, CORNERS } = computePieces()

	function pool() {
		return kind === 'edge' ? EDGES : CORNERS
	}
	function pick() {
		const all = pool()
		const ready = all.filter(ids => ids.every(id => !!labels[id]))
		const src = ready.length ? ready : all
		if (src.length === 0) return null
		return src[Math.floor(Math.random() * src.length)]
	}
	function show(ids) {
		if (group) {
			tScene.remove(group)
			group.traverse(o => {
				if (o.geometry) o.geometry.dispose()
				if (o.material) {
					if (Array.isArray(o.material)) o.material.forEach(m => m.dispose())
					else o.material.dispose()
				}
			})
		}
		const builder = ids.length === 2 ? buildEdgePiece : buildCornerPiece
		group = builder({ name: ids.join('-'), stickers: ids })
		orientGroupToCamera(group, ids, tCamera)
		// Ustaw pozycję w pionie zależnie od urządzenia: desktop = środek, mobile = wyżej
		adjustGroupY()
		tScene.add(group)
	}
	function renderFields(ids) {
		trainerFields.innerHTML = ''
		ids.forEach((id, idx) => {
			const face = id[0]
			const colorHex = FACE_COLORS[face]
			const row = document.createElement('div')
			row.className = 'sticker-row'
			const sw = document.createElement('span')
			sw.className = 'sticker-swatch'
			sw.style.background = `#${colorHex.toString(16).padStart(6, '0')}`
			const lab = document.createElement('span')
			lab.className = 'sticker-id'
			lab.textContent = STICKER_TO_SINGMASTER[id] || id
			lab.title = id
			const inp = document.createElement('input')
			inp.className = 'sticker-input'
			inp.maxLength = 1
			inp.dataset.id = id
			row.appendChild(sw)
			row.appendChild(lab)
			row.appendChild(inp)
			trainerFields.appendChild(row)
			inp.addEventListener('keydown', e => {
				if (e.key === 'Enter') trainerCheck.click()
			})
			if (idx === 0) setTimeout(() => inp.focus(), 0)
		})
	}

	function next() {
		const ids = pick()
		if (!ids) {
			showToast('Brak elementów z literami')
			return
		}
		show(ids)
		renderFields(ids)
	}

	function onResize() {
		const w = window.innerWidth
		const h = window.innerHeight
		tCamera.aspect = w / h
		tCamera.updateProjectionMatrix()
		tRenderer.setSize(w, h)
		// dopasuj pionową pozycję elementu przy zmianie rozmiaru/układu
		adjustGroupY()
	}
	window.addEventListener('resize', onResize)

	let raf = 0
	function loop() {
		tControls.update()
		tRenderer.render(tScene, tCamera)
		raf = requestAnimationFrame(loop)
	}
	loop()

	trainerCheck.onclick = () => {
		const rows = Array.from(trainerFields.querySelectorAll('.sticker-input'))
		let ok = 0
		const total = rows.length
		rows.forEach(inp => inp.classList.remove('wrong'))
		for (const inp of rows) {
			const id = inp.dataset.id
			const expected = (labels[id] || '').toUpperCase()
			const guess = (inp.value || '').trim().toUpperCase()
			if (guess === expected && expected) ok++
			else inp.classList.add('wrong')
		}
		showToast(`${ok}/${total}`, 2000)
		if (ok === total) next()
	}
	if (trainerNext) trainerNext.onclick = next
	if (openFullCubeBtn) openFullCubeBtn.onclick = stopPieceTrainer

	trainer = { kind, tScene, tCamera, tRenderer, tControls, group, onResize, raf }
	next()

	// Helper: pionowe ułożenie elementu (mobile wyżej, desktop środek)
	function adjustGroupY() {
		if (!group) return
		const isMobile = window.matchMedia('(max-width: 640px)').matches
		group.position.y = isMobile ? 0.75 : 0
	}
}

function stopPieceTrainer() {
	if (!trainer) {
		// Upewnij się, że UI wróci i główny renderer jest widoczny
		renderer.domElement.style.display = ''
		if (labelRenderer && labelRenderer.domElement) labelRenderer.domElement.style.display = ''
		trainerUI.classList.remove('open')
		trainerUI.setAttribute('aria-hidden', 'true')
		// dopasuj dystans kamery głównej po powrocie (mobile)
		applyMainCameraDistance(true)
		return
	}
	const { tScene, tCamera, tRenderer, tControls, group, onResize, raf } = trainer
	cancelAnimationFrame(raf)
	window.removeEventListener('resize', onResize)
	tScene.traverse(o => {
		if (o.geometry) o.geometry.dispose()
		if (o.material) {
			if (Array.isArray(o.material)) o.material.forEach(m => m.dispose())
			else o.material.dispose()
		}
	})
	tControls.dispose()
	tRenderer.dispose()
	if (tRenderer.domElement && tRenderer.domElement.parentElement === app) app.removeChild(tRenderer.domElement)
	trainer = null
	// przywróć widoczność głównej sceny
	renderer.domElement.style.display = ''
	if (labelRenderer && labelRenderer.domElement) labelRenderer.domElement.style.display = ''
	trainerUI.classList.remove('open')
	trainerUI.setAttribute('aria-hidden', 'true')
	trainerFields.innerHTML = ''
	// dopasuj dystans kamery głównej po powrocie (mobile)
	applyMainCameraDistance(true)
}
