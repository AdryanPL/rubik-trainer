import * as THREE from 'three'
import { OrbitControls } from '../vendor/three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from '../vendor/three/examples/jsm/renderers/CSS2DRenderer.js'

// ======= Scena / kamera / renderery =======
const app = document.getElementById('app')
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x0b0f14)

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100)
camera.position.set(0, 4, 10)

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

// Grupa główna kostki (łatwa rotacja orientacji)
const cubeGroup = new THREE.Group()
scene.add(cubeGroup)

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

// Przywrócenie domyślnego widoku kamery (po zmianie orientacji)
function resetCameraView() {
    // Bazowa pozycja zgodnie z inicjalizacją
    camera.position.set(0, 4, 10)
    // Cel na środek sceny/kostki
    if (controls && controls.target) controls.target.set(0, 0, 0)
    camera.lookAt(0, 0, 0)
    // Dopasuj dystans dla mobile/desktop i zaktualizuj kontroler
    applyMainCameraDistance(true)
    controls.update()
}

// Ustal, czy wszystkie wymagane pola (bez centrów i buforów) mają literki
function areAllRequiredLogicalFilled() {
    const needed = new Set()
    for (let pos = 0; pos < 54; pos++) {
        const physId = posToId[pos]
        const logical = canonicalLogicalId(physicalIdToLogicalId(physId))
        if (CENTER_IDS.has(logical)) continue
        if (DISABLED_LOGICAL.has(logical)) continue
        needed.add(logical)
    }
    for (const key of needed) {
        if (!labels[key] || String(labels[key]).trim() === '') return false
    }
    return true
}

function setLettersToggleByProgress() {
    if (!toggle) return
    toggle.checked = areAllRequiredLogicalFilled()
    updateLabelsVisibility()
}

// Hamburger menu (mobile): toggles #ui visibility
const menuToggle = document.getElementById('menuToggle')
const uiPanel = document.getElementById('ui')
const themeToggle = document.getElementById('toggleTheme')
const themeLabel = document.getElementById('themeLabel')
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

// ======= Theme switch (dark/light) =======
const THEME_KEY = 'rubik_theme'
function applyTheme(theme) {
	// Body background via CSS data attribute
	document.body.setAttribute('data-theme', theme)
	// Three scene background + fog color
	const bg = theme === 'light' ? 0xfaf9f9 : 0x0b0f14
	if (scene.background) scene.background.set ? scene.background.set(bg) : (scene.background = new THREE.Color(bg))
	else scene.background = new THREE.Color(bg)
	if (scene.fog) scene.fog.color.setHex(bg)
	// Button label
	if (themeLabel) themeLabel.textContent = `Tryb: ${theme === 'light' ? 'Jasny' : 'Ciemny'}`
	if (themeToggle) themeToggle.checked = theme === 'light'
	// Persist
	try {
		localStorage.setItem(THEME_KEY, theme)
	} catch {}
}

function initTheme() {
	let theme = 'dark'
	try {
		theme = localStorage.getItem(THEME_KEY) || 'dark'
	} catch {}
	applyTheme(theme)
}
if (themeToggle)
	themeToggle.addEventListener('change', () => {
		applyTheme(themeToggle.checked ? 'light' : 'dark')
	})

// ======= Pierwsze uruchomienie: wybór orientacji (front/top) =======
const ORIENTATION_KEY = 'rubik_orientation_v1'
const orientationOverlay = document.getElementById('orientationOverlay')
const stepTop = document.getElementById('orientationStepTop')
const stepFront = document.getElementById('orientationStepFront')
const frontChoices = document.getElementById('frontChoices')
const topChoices = document.getElementById('topChoices')
const orientationNextBtn = document.getElementById('orientationNextBtn')
const orientationBackBtn = document.getElementById('orientationBackBtn')
const orientationSaveBtn = document.getElementById('orientationSaveBtn')

const COLOR_HEX = {
	white: 0xffffff,
	yellow: 0xffea00,
	green: 0x00a650,
	blue: 0x1e90ff,
	red: 0xcc0000,
	orange: 0xfe7f00,
}
const COLOR_LABEL = {
	white: 'Biały',
	yellow: 'Żółty',
	green: 'Zielony',
	blue: 'Niebieski',
	red: 'Czerwony',
	orange: 'Pomarańczowy',
}
const OPPOSITE = { white: 'yellow', yellow: 'white', green: 'blue', blue: 'green', red: 'orange', orange: 'red' }

let selectedFront = null
let selectedTop = null

function buildColorGrid(container, colors) {
	container.innerHTML = ''
	colors.forEach(c => {
		const sw = document.createElement('button')
		sw.type = 'button'
		sw.className = 'color-swatch'
		sw.style.background = `#${COLOR_HEX[c].toString(16).padStart(6, '0')}`
		sw.setAttribute('role', 'radio')
		sw.setAttribute('aria-checked', 'false')
		sw.dataset.color = c
		sw.title = COLOR_LABEL[c]
		container.appendChild(sw)
	})
}

// top/front disabling handled by step filtering; no-op placeholder

function updateSaveEnabled() {
	const ok = !!selectedFront && !!selectedTop
	if (orientationSaveBtn) orientationSaveBtn.disabled = !ok
}

function selectSwatch(container, sw) {
	const prev = container.querySelector(".color-swatch[aria-checked='true']")
	if (prev) prev.setAttribute('aria-checked', 'false')
	sw.setAttribute('aria-checked', 'true')
}

function openOrientationOverlay() {
	if (!orientationOverlay) return
	// Hide main UI while overlay is open
	if (uiPanel) uiPanel.style.display = 'none'
	orientationOverlay.classList.add('open')
	orientationOverlay.setAttribute('aria-hidden', 'false')
}
function closeOrientationOverlay() {
	if (!orientationOverlay) return
	orientationOverlay.classList.remove('open')
	orientationOverlay.setAttribute('aria-hidden', 'true')
	// Restore main UI
	if (uiPanel) uiPanel.style.display = ''
}

function resetOrientationWizardState() {
	// Przywróć krok "Wybierz górę" i wyczyść wybory
	selectedFront = null
	selectedTop = null
	if (stepTop) stepTop.hidden = false
	if (stepFront) stepFront.hidden = true
	if (topChoices) buildColorGrid(topChoices, ['white','yellow','green','blue','red','orange'])
	if (frontChoices) frontChoices.innerHTML = ''
	const grids = [frontChoices, topChoices]
	grids.forEach(container => {
		if (!container) return
		container.querySelectorAll('.color-swatch').forEach(sw => sw.setAttribute('aria-checked','false'))
	})
	if (orientationSaveBtn) orientationSaveBtn.disabled = true
	if (orientationNextBtn) orientationNextBtn.disabled = true
}

function initOrientation() {
	// If overlay missing, skip
	if (!orientationOverlay || !frontChoices || !topChoices) return
	// Build top step grid
	buildColorGrid(topChoices, ['white','yellow','green','blue','red','orange'])

	// listeners
	topChoices.addEventListener('click', e => {
		const sw = e.target && e.target.closest('.color-swatch')
		if (!sw) return
		selectedTop = sw.dataset.color
		selectSwatch(topChoices, sw)
		if (orientationNextBtn) orientationNextBtn.disabled = !selectedTop
	})
	frontChoices.addEventListener('click', e => {
		const sw = e.target && e.target.closest('.color-swatch')
		if (!sw) return
		selectedFront = sw.dataset.color
		selectSwatch(frontChoices, sw)
		updateSaveEnabled()
	})
	if (orientationNextBtn) {
		orientationNextBtn.addEventListener('click', () => {
			const all = ['white','yellow','green','blue','red','orange']
			const invalid = new Set([selectedTop, OPPOSITE[selectedTop]])
			const allowed = all.filter(c => !invalid.has(c))
			buildColorGrid(frontChoices, allowed)
			selectedFront = null
			updateSaveEnabled()
			if (stepTop) stepTop.hidden = true
			if (stepFront) stepFront.hidden = false
		})
	}
	if (orientationBackBtn) {
		orientationBackBtn.addEventListener('click', () => {
			if (stepFront) stepFront.hidden = true
			if (stepTop) stepTop.hidden = false
			if (orientationNextBtn) orientationNextBtn.disabled = !selectedTop
		})
	}
  if (orientationSaveBtn) {
    orientationSaveBtn.addEventListener('click', () => {
      const data = { front: selectedFront, top: selectedTop }
      try {
        localStorage.setItem(ORIENTATION_KEY, JSON.stringify(data))
      } catch {}
      applyOrientationFromSelection(data)
      // Po zatwierdzeniu wyboru przywróć widok kamery do pozycji bazowej
      resetCameraView()
      // Po zatwierdzeniu: odznacz "Pokaż literki" i ukryj kropki tylko dla liter
      if (toggle) toggle.checked = false
      updateLabelsVisibility()
      closeOrientationOverlay()
    })
  }

	// first-run: show overlay only if not saved
	let saved = null
	try {
		const raw = localStorage.getItem(ORIENTATION_KEY)
		saved = raw ? JSON.parse(raw) : null
	} catch {}
	if (!saved) {
		resetOrientationWizardState()
		openOrientationOverlay()
	} else {
		applyOrientationFromSelection(saved)
	}

  updateSaveEnabled()
  refreshDisabledByLogic()
  refreshAllLabelTexts()
  // Ustaw checkbox wg progressu na starcie
  setLettersToggleByProgress()
}

initTheme()

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
cubeGroup.add(core)

// Spójna orientacja u/v dla wszystkich ścian: "u" = w prawo, "v" = w dół
// (gdy patrzymy na daną ścianę jak na front)
const faces = [
	{ name: 'F', normal: new THREE.Vector3(0, 0, 1), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, -1, 0) },
	{ name: 'B', normal: new THREE.Vector3(0, 0, -1), u: new THREE.Vector3(-1, 0, 0), v: new THREE.Vector3(0, -1, 0) },
	{ name: 'U', normal: new THREE.Vector3(0, 1, 0), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1) },
	{ name: 'D', normal: new THREE.Vector3(0, -1, 0), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, -1) },
	{ name: 'R', normal: new THREE.Vector3(1, 0, 0), u: new THREE.Vector3(0, 0, -1), v: new THREE.Vector3(0, -1, 0) },
	{ name: 'L', normal: new THREE.Vector3(-1, 0, 0), u: new THREE.Vector3(0, 0, 1), v: new THREE.Vector3(0, -1, 0) },
]

// Mapowanie orientacji (domyślnie referencyjne)
let currentOldToOriented = { U: 'U', D: 'D', F: 'F', B: 'B', R: 'R', L: 'L' }
let currentOrientedToOld = { U: 'U', D: 'D', F: 'F', B: 'B', R: 'R', L: 'L' }
let faceRotationSteps = { U: 0, D: 0, F: 0, B: 0, R: 0, L: 0 }

const stickerMeshes = []
const labelMap = new Map()
const dotMap = new Map()
const idToTile = new Map()
// Bufory definiowane LOGICZNIE (niezależnie od orientacji)
// Edge buffers: U5, R1; Corner buffers: U0, B2, L0
const DISABLED_LOGICAL = new Set(['U0', 'U5', 'R1', 'B2', 'L0'])
const DOT_BLOCKED = new Set(DISABLED_LOGICAL)
const CENTER_IDS = new Set(['U4', 'D4', 'F4', 'B4', 'R4', 'L4'])

// ======= Persistencja =======
const STORAGE_KEY = 'rubik_labels_v1'
const LABELS_VERSION_KEY = 'rubik_labels_version'
// Mapowanie fizyczny↔logiczny (w referencji są tożsame; zostawiamy funkcje dla czytelności)
function physicalIdToLogicalId(physId) {
    // Logiczne ID w aktualnej orientacji: stary (fizyczny) -> zorientowany (logiczny)
    return toOrientedId(physId)
}
function logicalIdToPhysicalId(logId) {
    // Odwrócenie: logiczny (zorientowany) -> fizyczny (referencyjny)
    return toPhysicalId(logId)
}
function loadLabels() {
	let obj = {}
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		obj = raw ? JSON.parse(raw) : {}
	} catch {
		obj = {}
	}
	// Migracja do ID logicznych (v2)
	let ver = 1
	try {
		ver = parseInt(localStorage.getItem(LABELS_VERSION_KEY) || '1', 10)
	} catch {}
	if (ver === 2) return obj
	const migrated = {}
	for (const [k, v] of Object.entries(obj)) {
		const logical = physicalIdToLogicalId(k)
		if (!CENTER_IDS.has(logical)) migrated[logical] = v
	}
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
		localStorage.setItem(LABELS_VERSION_KEY, '2')
	} catch {}
	return migrated
}
function saveLabels(obj) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
		localStorage.setItem(LABELS_VERSION_KEY, '2')
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
			const tile = new THREE.Mesh(tileGeom, mat)
			tile.position.copy(center)
			tile.lookAt(center.clone().add(face.normal))
			const isCenter = idx === 4
			tile.userData = { id, face: face.name, idx, center: isCenter, disabled: isCenter }
			cubeGroup.add(tile)
			stickerMeshes.push(tile)
			idToTile.set(id, tile)

			const div = document.createElement('div')
			div.className = 'label'
			// Czarny kolor liter dla wszystkich pól
			div.style.color = '#000000'
			div.style.textShadow = 'none'
			if (isCenter) {
				const lid = physicalIdToLogicalId(id)
				if (labels[lid]) delete labels[lid]
				_disabledLabelsCleared = true
			}
			// Etykieta wg LOGICZNEGO ID (z aliasami buforów)
			{
				const lid = physicalIdToLogicalId(id)
				const canon = canonicalLogicalId(lid)
				div.textContent = labels[canon] || ''
			}
			const label = new CSS2DObject(div)
			label.position.set(0, 0, 0.002)
			tile.add(label)
			if (!div.textContent) label.element.style.display = 'none'
			labelMap.set(id, label)

			if (idx !== 4) {
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
cubeGroup.add(edges)

// ======= Orientacja wg wyboru użytkownika =======
const COLOR_TO_FACE = { white: 'U', yellow: 'D', green: 'F', blue: 'B', red: 'R', orange: 'L' }

function invertFaceMap(m) {
	return Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k]))
}

function computeOrientationQuaternion(frontFace, topFace) {
	// frontFace, topFace: litery bazowe (U/D/F/B/R/L)
	const nf = faces
		.find(f => f.name === frontFace)
		.normal.clone()
		.normalize()
	const nu = faces
		.find(f => f.name === topFace)
		.normal.clone()
		.normalize()
	// q1: nF -> +Z
	const q1 = new THREE.Quaternion().setFromUnitVectors(nf, new THREE.Vector3(0, 0, 1))
	const u1 = nu.clone().applyQuaternion(q1)
	// obróć wokół Z tak, by u1 -> +Y
	// Wyznacz kąt względem osi X: theta = atan2(y, x). Chcemy α = π/2 - theta,
	// aby obrócić dowolny wektor w płaszczyźnie XY na +Y.
	const theta = Math.atan2(u1.y, u1.x)
	const angleZ = Math.PI / 2 - theta
	const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angleZ)
	const q = new THREE.Quaternion().multiplyQuaternions(q2, q1)
	return q
}

function deriveFaceMapFromQuaternion(q) {
	// Po rotacji q, sprawdź gdzie trafiają oryginalne normalne
	const dirs = {
		F: new THREE.Vector3(0, 0, 1),
		B: new THREE.Vector3(0, 0, -1),
		U: new THREE.Vector3(0, 1, 0),
		D: new THREE.Vector3(0, -1, 0),
		R: new THREE.Vector3(1, 0, 0),
		L: new THREE.Vector3(-1, 0, 0),
	}
	const oldToOriented = {}
	const axisFace = v => {
		const x = v.x,
			y = v.y,
			z = v.z
		const ax = Math.abs(x),
			ay = Math.abs(y),
			az = Math.abs(z)
		if (az >= ax && az >= ay) return z >= 0 ? 'F' : 'B'
		if (ay >= ax && ay >= az) return y >= 0 ? 'U' : 'D'
		return x >= 0 ? 'R' : 'L'
	}
	for (const [face, n] of Object.entries(dirs)) {
		// n is original normal; after q, where does it point?
		const t = n.clone().applyQuaternion(q)
    const o = axisFace(t)
    oldToOriented[face] = o
  }
  const orientedToOld = invertFaceMap(oldToOriented)
  // compute per-face rotation of indices (0,1,2,3) CW so that old face grid aligns to canonical grid of the oriented face
  const axisEquals = (a, b) => a.clone().normalize().dot(b.clone().normalize()) > 0.98
  for (const oldFace of ['U','D','F','B','R','L']) {
    const newFace = oldToOriented[oldFace]
    // old face basis in world after applying q (how the physical face sits now)
    const uOld = faces.find(f => f.name === oldFace).u.clone().applyQuaternion(q)
    const vOld = faces.find(f => f.name === oldFace).v.clone().applyQuaternion(q)
    // target canonical basis for the oriented face in world (no q!)
    const uCan = faces.find(f => f.name === newFace).u.clone()
    const vCan = faces.find(f => f.name === newFace).v.clone()
    let rot = 0
    if (axisEquals(uOld, uCan) && axisEquals(vOld, vCan)) rot = 0
    else if (axisEquals(uOld, vCan) && axisEquals(vOld, uCan.clone().negate())) rot = 1
    else if (axisEquals(uOld, uCan.clone().negate()) && axisEquals(vOld, vCan.clone().negate())) rot = 2
    else if (axisEquals(uOld, vCan.clone().negate()) && axisEquals(vOld, uCan)) rot = 3
    else rot = 0
    faceRotationSteps[oldFace] = rot
  }
  return { oldToOriented, orientedToOld }
}

function rotateIndexCW(idx, steps) {
  steps = ((steps % 4) + 4) % 4
  const r = Math.floor(idx / 3)
  const c = idx % 3
  let nr = r, nc = c
  if (steps === 1) {
    nr = c
    nc = 2 - r
  } else if (steps === 2) {
    nr = 2 - r
    nc = 2 - c
  } else if (steps === 3) {
    nr = 2 - c
    nc = r
  }
  return nr * 3 + nc
}

function toOrientedId(physId) {
  if (!physId || typeof physId !== 'string') return physId
  const f = physId[0]
  const idx = Number(physId.slice(1))
  const nf = currentOldToOriented[f] || f
  const steps = faceRotationSteps[f] || 0
  const nidx = rotateIndexCW(idx, steps)
  return nf + String(nidx)
}
function toPhysicalId(orientedId) {
  if (!orientedId || typeof orientedId !== 'string') return orientedId
  const f = orientedId[0]
  const idx = Number(orientedId.slice(1))
  const of = currentOrientedToOld[f] || f
  const steps = faceRotationSteps[of] || 0
  const back = (4 - (steps % 4)) % 4
  const pidx = rotateIndexCW(idx, back)
  return of + String(pidx)
}

function applyOrientationFromSelection(sel) {
	if (!sel || !sel.front || !sel.top) return
	const frontFace = COLOR_TO_FACE[sel.front]
	const topFace = COLOR_TO_FACE[sel.top]
	if (!frontFace || !topFace) return
	const q = computeOrientationQuaternion(frontFace, topFace)
	cubeGroup.quaternion.copy(q)
  const maps = deriveFaceMapFromQuaternion(q)
  currentOldToOriented = maps.oldToOriented
  currentOrientedToOld = maps.orientedToOld
  // po zmianie orientacji odśwież blokady, teksty, kolory i widoczność etykiet
  refreshDisabledByLogic()
  refreshAllLabelTexts()
  repaintByState()
  updateLabelsVisibility()
}
// ======== Cubie model (rogi + krawędzie) ========
const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B']
const FACE_OFFSET = { U: 0, R: 9, F: 18, D: 27, L: 36, B: 45 }
const posToId = Array.from({ length: 54 }, (_, i) => FACE_ORDER[Math.floor(i / 9)] + (i % 9))
const idToPos = new Map(posToId.map((id, i) => [id, i]))

const U = 'U',
	R = 'R',
	F = 'F',
	D = 'D',
	L = 'L',
	B = 'B'
const pos = (f, i) => FACE_OFFSET[f] + i

const CORNER_FACELETS = [
	[pos(U, 8), pos(R, 0), pos(F, 2)],
	[pos(U, 6), pos(F, 0), pos(L, 2)],
	[pos(U, 0), pos(L, 0), pos(B, 2)],
	[pos(U, 2), pos(B, 0), pos(R, 2)],
	[pos(D, 2), pos(F, 8), pos(R, 6)],
	[pos(D, 0), pos(L, 8), pos(F, 6)],
	[pos(D, 6), pos(B, 8), pos(L, 6)],
	[pos(D, 8), pos(R, 8), pos(B, 6)],
]
const EDGE_FACELETS = [
	[pos(U, 5), pos(R, 1)],
	[pos(U, 7), pos(F, 1)],
	[pos(U, 3), pos(L, 1)],
	[pos(U, 1), pos(B, 1)],
	[pos(D, 5), pos(R, 7)],
	[pos(D, 7), pos(F, 7)],
	[pos(D, 3), pos(L, 7)],
	[pos(D, 1), pos(B, 7)],
	[pos(F, 5), pos(R, 3)],
	[pos(F, 3), pos(L, 5)],
	[pos(B, 3), pos(L, 3)],
	[pos(B, 5), pos(R, 5)],
]
const CORNER_COLORS = [
	[U, R, F],
	[U, F, L],
	[U, L, B],
	[U, B, R],
	[D, F, R],
	[D, L, F],
	[D, B, L],
	[D, R, B],
]
const EDGE_COLORS = [
	[U, R],
	[U, F],
	[U, L],
	[U, B],
	[D, R],
	[D, F],
	[D, L],
	[D, B],
	[F, R],
	[F, L],
	[B, L],
	[B, R],
]

let cornerPerm = [0, 1, 2, 3, 4, 5, 6, 7]
let cornerOri = [0, 0, 0, 0, 0, 0, 0, 0]
let edgePerm = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
let edgeOri = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

function resetCubie() {
	cornerPerm = [0, 1, 2, 3, 4, 5, 6, 7]
	cornerOri = [0, 0, 0, 0, 0, 0, 0, 0]
	edgePerm = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
	edgeOri = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
}

function repaintByState() {
	// najpierw centra
	for (let f = 0; f < 6; f++) {
		const face = FACE_ORDER[f]
		const base = FACE_OFFSET[face]
		const hex = FACE_COLORS[face]
		for (let i = 0; i < 9; i++) {
			const tileId = posToId[base + i]
			const tile = idToTile.get(tileId)
			if (!tile) continue
			if (tile.userData.disabled) {
				const col = new THREE.Color(hex)
				col.multiplyScalar(0.18)
				tile.material.color.copy(col)
			} else {
				tile.material.color.setHex(hex)
			}
		}
	}
	// rogi
	for (let i = 0; i < 8; i++) {
		const p = cornerPerm[i]
		const o = cornerOri[i]
		const facelets = CORNER_FACELETS[i]
		const colors = CORNER_COLORS[p]
		for (let j = 0; j < 3; j++) {
			const facelet = facelets[j]
			const faceName = colors[(j + 3 - o) % 3]
			const hex = FACE_COLORS[faceName]
			const tileId = posToId[facelet]
			const tile = idToTile.get(tileId)
			if (!tile) continue
			if (tile.userData.disabled) {
				const col = new THREE.Color(hex)
				col.multiplyScalar(0.18)
				tile.material.color.copy(col)
			} else {
				tile.material.color.setHex(hex)
			}
		}
	}
	// krawędzie
	for (let i = 0; i < 12; i++) {
		const p = edgePerm[i]
		const o = edgeOri[i]
		const facelets = EDGE_FACELETS[i]
		const colors = EDGE_COLORS[p]
		for (let j = 0; j < 2; j++) {
			const facelet = facelets[j]
			const faceName = colors[(j + 2 - o) % 2]
			const hex = FACE_COLORS[faceName]
			const tileId = posToId[facelet]
			const tile = idToTile.get(tileId)
			if (!tile) continue
			if (tile.userData.disabled) {
				const col = new THREE.Color(hex)
				col.multiplyScalar(0.18)
				tile.material.color.copy(col)
			} else {
				tile.material.color.setHex(hex)
			}
		}
	}
}

// Zwraca tablicę długości 54: dla każdego faceletu zwraca literę ściany (U/R/F/D/L/B)
function computeFaceNameByPos() {
	const faceNameByPos = new Array(54).fill(null)
	// centra
	for (let f = 0; f < 6; f++) {
		const face = FACE_ORDER[f]
		const base = FACE_OFFSET[face]
		for (let i = 0; i < 9; i++) faceNameByPos[base + i] = face
	}
	// rogi
	for (let i = 0; i < 8; i++) {
		const p = cornerPerm[i]
		const o = cornerOri[i]
		const facelets = CORNER_FACELETS[i]
		const colors = CORNER_COLORS[p]
		for (let j = 0; j < 3; j++) {
			const facelet = facelets[j]
			const faceName = colors[(j + 3 - o) % 3]
			faceNameByPos[facelet] = faceName
		}
	}
	// krawędzie
	for (let i = 0; i < 12; i++) {
		const p = edgePerm[i]
		const o = edgeOri[i]
		const facelets = EDGE_FACELETS[i]
		const colors = EDGE_COLORS[p]
		for (let j = 0; j < 2; j++) {
			const facelet = facelets[j]
			const faceName = colors[(j + 2 - o) % 2]
			faceNameByPos[facelet] = faceName
		}
	}
	return faceNameByPos
}

function updateLabelColorByCubie() {
	// Czarny kolor liter dla wszystkich pól
	labelMap.forEach(lbl => {
		lbl.element.style.color = '#000000'
		lbl.element.style.textShadow = 'none'
	})
}

function canonicalLogicalId(logId) {
  if (logId === 'R1') return 'U5'
  if (logId === 'B2' || logId === 'L0') return 'U0'
  return logId
}

function refreshAllLabelTexts() {
  labelMap.forEach((lbl, physId) => {
    const logical = physicalIdToLogicalId(physId)
    const canon = canonicalLogicalId(logical)
    lbl.element.textContent = labels[canon] || ''
  })
}

function refreshDisabledByLogic() {
  stickerMeshes.forEach(tile => {
    const physId = tile.userData.id
    const logical = physicalIdToLogicalId(physId)
    tile.userData.disabled = tile.userData.center || DISABLED_LOGICAL.has(logical)
  })
}

// ======= Litery powiązane z faceletami (podążają za elementami) =======
let faceletLabels = Array.from({ length: 54 }, () => '')

function buildLabelsObjectFromFacelets() {
	const obj = {}
	for (let i = 0; i < 54; i++) {
		const val = faceletLabels[i]
		if (val) obj[posToId[i]] = val
	}
	return obj
}

function buildFaceletMappingFromCubie() {
	// Zwraca tablicę map[posIndex] = originalFaceletIndex
	const map = new Array(54).fill(-1)
	// rogi
	for (let i = 0; i < 8; i++) {
		const p = cornerPerm[i]
		const o = cornerOri[i]
		const faceletsPos = CORNER_FACELETS[i]
		const faceletsOrig = CORNER_FACELETS[p]
		for (let j = 0; j < 3; j++) {
			const posIndex = faceletsPos[j]
			const origIndex = faceletsOrig[(j + 3 - o) % 3]
			map[posIndex] = origIndex
		}
	}
	// krawędzie
	for (let i = 0; i < 12; i++) {
		const p = edgePerm[i]
		const o = edgeOri[i]
		const faceletsPos = EDGE_FACELETS[i]
		const faceletsOrig = EDGE_FACELETS[p]
		for (let j = 0; j < 2; j++) {
			const posIndex = faceletsPos[j]
			const origIndex = faceletsOrig[(j + 2 - o) % 2]
			map[posIndex] = origIndex
		}
	}
	// centra: mapują się na siebie
	for (const f of FACE_ORDER) {
		const base = FACE_OFFSET[f]
		const center = base + 4
		map[center] = center
	}
	return map
}

function updateLabelTextsByCubie() {
    const mapping = buildFaceletMappingFromCubie()
    for (let pos = 0; pos < 54; pos++) {
        const id = posToId[pos]
        const lblObj = labelMap.get(id)
        if (!lblObj) continue
        const logical = physicalIdToLogicalId(id)
        lblObj.element.textContent = labels[logical] || ''
    }
}
// Inicjalizacja: wczytaj litery z labels (id->litera) do faceletLabels,
// następnie ustaw stan cubie na ułożony i odmaluj kolory oraz etykiety.
for (const [id, val] of Object.entries(labels || {})) {
	const p = idToPos.get(id)
	if (p != null) faceletLabels[p] = val
}

function cycle4(arr, a, b, c, d) {
	const t = arr[a]
	arr[a] = arr[b]
	arr[b] = arr[c]
	arr[c] = arr[d]
	arr[d] = t
}
function addCornerOri(a, b, c, d, da, db, dc, dd) {
	cornerOri[a] = (cornerOri[a] + da) % 3
	cornerOri[b] = (cornerOri[b] + db) % 3
	cornerOri[c] = (cornerOri[c] + dc) % 3
	cornerOri[d] = (cornerOri[d] + dd) % 3
}
function flipEdges(idxs) {
	for (const i of idxs) edgeOri[i] ^= 1
}

function moveU() {
	cycle4(cornerPerm, 0, 1, 2, 3)
	cycle4(edgePerm, 0, 1, 2, 3)
}
function moveD() {
	cycle4(cornerPerm, 4, 5, 6, 7)
	cycle4(edgePerm, 4, 5, 6, 7)
}
function moveR() {
	cycle4(cornerPerm, 0, 3, 7, 4)
	cycle4(edgePerm, 0, 11, 4, 8)
	addCornerOri(0, 3, 7, 4, 2, 1, 2, 1)
}
function moveL() {
	cycle4(cornerPerm, 1, 2, 6, 5)
	cycle4(edgePerm, 2, 9, 6, 10)
	addCornerOri(1, 2, 6, 5, 1, 2, 1, 2)
}
function moveF() {
	cycle4(cornerPerm, 0, 1, 5, 4)
	cycle4(edgePerm, 1, 9, 5, 8)
	addCornerOri(0, 1, 5, 4, 1, 2, 1, 2)
	flipEdges([1, 9, 5, 8])
}
function moveB() {
	cycle4(cornerPerm, 2, 3, 7, 6)
	cycle4(edgePerm, 3, 11, 7, 10)
	addCornerOri(2, 3, 7, 6, 2, 1, 2, 1)
	flipEdges([3, 11, 7, 10])
}

const MOVE_FUN = { U: moveU, D: moveD, R: moveR, L: moveL, F: moveF, B: moveB }
function applyMoveCubie(m) {
	const base = m[0],
		suf = m.length > 1 ? m[1] : ''
	const fn = MOVE_FUN[base]
	if (!fn) return
	if (suf === "'") {
		fn()
		fn()
		fn()
	} else if (suf === '2') {
		fn()
		fn()
	} else {
		fn()
	}
}
function applyScrambleCubie(moves) {
	for (const m of moves) applyMoveCubie(m)
}

// (usunięto generowanie scramble)

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

	// Tytuł z oryginalnym ID pola (np. F0, U2)
	title.textContent = `Litera dla pola ${stickerId}`
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
		// wymuś uppercase na bieżąco (bez limitu długości)
		input.addEventListener('input', () => {
			input.value = (input.value || '').toUpperCase()
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
	const physId = tile.userData.id
	const logicalId = physicalIdToLogicalId(physId)
	const mode = document.getElementById('mode').value
	if (mode === 'edit') {
		if (tile.userData.disabled) {
			showToast(tile.userData.center ? 'Nie można ustawić litery na środku.' : 'To pole jest buforem.')
			return
		}
    const current = labels[canonicalLogicalId(logicalId)] || ''
    const val = await openLetterModal(canonicalLogicalId(logicalId), current)
		if (val === null) return
		const clean = (val || '').trim().toUpperCase()
    const key = canonicalLogicalId(logicalId)
    if (clean) labels[key] = clean
    else delete labels[key]
		// odśwież UI pozycyjnie
		const lbl = labelMap.get(physId)
		if (lbl) lbl.element.textContent = clean
		saveLabels(labels)
		updateLabelsVisibility()
	} else {
		// W trybie quiz: zablokuj bufory i środki tak jak w edycji
		if (tile.userData.disabled) {
			showToast(tile.userData.center ? 'Nie można ustawić litery na środku.' : 'To pole jest buforem.')
			return
		}
		// Sprawdź literę przypisaną do pozycji (id)
    const target = (labels[canonicalLogicalId(logicalId)] || '').toUpperCase()
		if (!target) {
			showToast(`Dla ${logicalId} nie ustawiono litery.`)
			return
		}
    const guessRaw = await openLetterModal(canonicalLogicalId(logicalId), '')
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
		if (hasText) {
			tile.getWorldPosition(_tmpPos)
			tile.getWorldDirection(_tmpDir)
			_toCam.copy(camera.position).sub(_tmpPos).normalize()
			facing = _tmpDir.dot(_toCam) > 0.05
		}
		// Literki: widoczne zawsze, jeśli są ustawione, płytka jest widoczna i nie jest disabled
		const show = !!(hasText && facing && !tile.userData.disabled)
		lbl.visible = show
		lbl.element.style.display = show ? 'block' : 'none'
	}
	// Kropki: gdy checkbox zaznaczony – ukryj, gdy odznaczony – pokaż tylko na pustych polach
	dotMap.forEach((dot, id) => {
		const lbl = labelMap.get(id)
		const hasText = !!(lbl && lbl.element.textContent)
		const tile = idToTile.get(id)
		const disabled = tile ? tile.userData.disabled : false
		dot.visible = !showLetters && !hasText && !disabled
	})
}
toggle.addEventListener('change', updateLabelsVisibility)

// Inicjalne odmalowanie po pełnej inicjalizacji
resetCubie()
repaintByState()
updateLabelColorByCubie()
updateLabelsVisibility()

// Tryb quiz: po przełączeniu na "quiz (zgaduj)" ukryj literki na start
const modeSelect = document.getElementById('mode')
if (modeSelect) {
	modeSelect.addEventListener('change', () => {
		if (modeSelect.value === 'quiz') {
			toggle.checked = false
			updateLabelsVisibility()
		}
	})
}

// Reset / eksport / import
document.getElementById('reset').addEventListener('click', () => {
	if (!confirm('Na pewno usunąć wszystkie literki?')) return
	labels = {}
	saveLabels(labels)
	labelMap.forEach(lbl => (lbl.element.textContent = ''))
	if (toggle) toggle.checked = false
	updateLabelsVisibility()
	showToast('Wyczyszczono.')
	// Po resecie literek otwórz kreator orientacji od ekranu Start
	resetOrientationWizardState()
	openOrientationOverlay()
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
				// Przepisz aliasy buforów na kanoniczne klucze i usuń centra
				const rewritten = {}
				for (const [k, v] of Object.entries(labels)) {
					const canon = canonicalLogicalId(k)
					if (!CENTER_IDS.has(canon)) rewritten[canon] = v
				}
				labels = rewritten
				saveLabels(labels)
				// Odśwież etykiety wg LOGICZNEGO ID i ustaw checkbox wg progressu
				refreshAllLabelTexts()
				setLettersToggleByProgress()
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

// (usunięto obsługę przycisków Wymieszaj/Ułóż)

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

// Zastosuj orientację (jeśli ustawiona) i ewentualnie pokaż kreator przy pierwszym uruchomieniu
initOrientation()

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
	// Stabilne zaokrąglenie z tolerancją (po zmianie orientacji u/v)
	const uRaw = pos.clone().dot(face.u) / TILE
	const vRaw = pos.clone().dot(face.v) / TILE
	const u = THREE.MathUtils.clamp(Math.round(uRaw + EPS), -1, 1)
	const v = THREE.MathUtils.clamp(Math.round(vRaw + EPS), -1, 1)
	const col = u + 1
	const row = v + 1
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
		// róg – dwie ściany (top/bottom zależnie od znaku vCoord)
		const n1 = face.v.clone().multiplyScalar(Math.sign(vCoord))
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
		if (uCoord === 0) n = face.v.clone().multiplyScalar(Math.sign(vCoord))
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

// Usunięto notację Singmaster; wracamy do identyfikatorów typu F0, U2 itp.

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
	let lastIdsKey = null // aby unikać powtórzenia tego samego elementu
	const { EDGES, CORNERS } = computePieces()

	function pool() {
		return kind === 'edge' ? EDGES : CORNERS
	}
	function pick() {
		const all = pool()
    const ready = all.filter(ids => ids.every(id => !!labels[canonicalLogicalId(physicalIdToLogicalId(id))]))
		let src = ready.length ? ready : all
		// unikaj powtórki tego samego elementu, jeśli mamy więcej niż jedną opcję
		if (src.length > 1 && lastIdsKey) {
			const filtered = src.filter(ids => ids.join('+') !== lastIdsKey)
			if (filtered.length) src = filtered
		}
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
		lastIdsKey = ids.join('+')
	}
	function renderFields(ids) {
		trainerFields.innerHTML = ''
		const FACE_NAMES = { U: 'Biały', D: 'Żółty', F: 'Zielony', B: 'Niebieski', R: 'Czerwony', L: 'Pomarańczowy' }
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
			lab.textContent = FACE_NAMES[face] || id
			lab.title = id // logiczne ID w podpowiedzi
			const inp = document.createElement('input')
			inp.className = 'sticker-input'
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
    const logical = physicalIdToLogicalId(id)
    const expected = (labels[canonicalLogicalId(logical)] || '').toUpperCase()
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
