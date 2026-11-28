class_name InkAmbientSoundscape
extends Node

## 《墨夜点灯人》程序化民俗环境音场（Godot 4.7.2 / GL Compatibility）
## 三层实时合成，无需外部音频文件：
## 1. 夜风枯竹（低频滤波粉红噪声 + 呼吸式共振峰，诡界压低共鸣、熄灯瞬间收紧）
## 2. 远更鼓梆（周期远景更鼓 + 空竹梆子，渡墨镇安全区自动静音）
## 3. 判官竹篾沙沙（纸扎判官登场激活，二相叠加快节奏竹篾与干磬震颤）

const MIX_RATE: float = 22050.0
const BUFFER_LENGTH: float = 0.22

var _player: AudioStreamPlayer = null
var _playback: AudioStreamGeneratorPlayback = null

var _muted: bool = false
var _master_gain: float = 0.42

# 运行态参数（由 main.gd 每帧同步）
var _phase_name: String = "TITLE"
var _realm_blend: float = 0.0
var _blackout_active: bool = false
var _boss_active: bool = false
var _boss_phase2: bool = false
var _danger_level: float = 0.0

# 内部合成器相位与滤波器状态
var _rng_state: int = 2463534242
var _time_sec: float = 0.0
var _lp_wind: float = 0.0
var _lp_wind2: float = 0.0
var _bp_rustle: float = 0.0
var _hp_prev: float = 0.0

# 更鼓梆子节拍器状态
var _watch_timer: float = 3.5
var _watch_env: float = 0.0
var _watch_phase: float = 0.0
var _clapper_delay: float = -1.0
var _clapper_env: float = 0.0
var _clapper_phase: float = 0.0


func _ready() -> void:
	_setup_audio_player()


func _setup_audio_player() -> void:
	if _player != null:
		return
	var stream: AudioStreamGenerator = AudioStreamGenerator.new()
	stream.mix_rate = MIX_RATE
	stream.buffer_length = BUFFER_LENGTH

	_player = AudioStreamPlayer.new()
	_player.name = "AmbientGeneratorPlayer"
	_player.stream = stream
	_player.bus = "Master"
	add_child(_player)

	if not DisplayServer.get_name().to_lower().contains("headless"):
		_player.play()
		var pb: AudioStreamPlayback = _player.get_stream_playback()
		if pb is AudioStreamGeneratorPlayback:
			_playback = pb as AudioStreamGeneratorPlayback


func update_state(
	phase_name: String,
	realm_blend: float,
	blackout_active: bool,
	boss_active: bool,
	boss_phase2: bool,
	danger_level: float = 0.0
) -> void:
	_phase_name = phase_name
	_realm_blend = clampf(realm_blend, 0.0, 1.0)
	_blackout_active = blackout_active
	_boss_active = boss_active
	_boss_phase2 = boss_phase2
	_danger_level = clampf(danger_level, 0.0, 1.0)


func set_muted(muted: bool) -> void:
	_muted = muted
	if _player != null:
		_player.stream_paused = muted


func is_muted() -> bool:
	return _muted


func set_master_gain(gain: float) -> void:
	_master_gain = clampf(gain, 0.0, 1.0)


func get_master_gain() -> float:
	return _master_gain


func _process(_delta: float) -> void:
	if _muted or _playback == null:
		return
	var frames_available: int = _playback.get_frames_available()
	if frames_available <= 0:
		return
	var to_fill: int = mini(frames_available, 1024)
	for _i: int in range(to_fill):
		var s: float = _next_sample()
		_playback.push_frame(Vector2(s, s))


## 供无头自动化测试直接拉取采样，不依赖音频硬件设备
func synthesize_preview_samples(frame_count: int) -> PackedFloat32Array:
	var out: PackedFloat32Array = PackedFloat32Array()
	out.resize(maxi(frame_count, 0))
	for i: int in range(out.size()):
		out[i] = _next_sample()
	return out


func _white_noise() -> float:
	# Xorshift32 确定性白噪声 [-1.0, 1.0]
	var x: int = _rng_state & 0xFFFFFFFF
	x = (x ^ ((x << 13) & 0xFFFFFFFF)) & 0xFFFFFFFF
	x = (x ^ (x >> 17)) & 0xFFFFFFFF
	x = (x ^ ((x << 5) & 0xFFFFFFFF)) & 0xFFFFFFFF
	_rng_state = x if x != 0 else 135792468
	return (float(_rng_state & 0xFFFF) / 32767.5) - 1.0


func _next_sample() -> float:
	if _muted:
		return 0.0

	var dt: float = 1.0 / MIX_RATE
	_time_sec += dt

	var is_town: bool = (_phase_name == "TOWN")
	var is_playing: bool = (_phase_name == "PLAYING")
	var noise: float = _white_noise()

	# ---------------------------------------------------------
	# 层 1：夜风枯竹（双阶低通风声 + 诡界幽谷低频共鸣）
	# ---------------------------------------------------------
	var gust_lfo: float = 0.55 + 0.45 * sin(_time_sec * 0.42 + sin(_time_sec * 0.17) * 1.4)
	var wind_cutoff: float = lerpf(0.022, 0.045, gust_lfo)
	if _realm_blend > 0.01:
		wind_cutoff = lerpf(wind_cutoff, 0.014, _realm_blend * 0.7)
	if _blackout_active:
		wind_cutoff *= 0.65

	_lp_wind += (noise - _lp_wind) * wind_cutoff
	_lp_wind2 += (_lp_wind - _lp_wind2) * (wind_cutoff * 1.35)

	var wind_gain: float = 0.24 if is_town else (0.34 + 0.12 * _danger_level)
	if _blackout_active:
		wind_gain *= 0.72

	# 诡界极低频幽鸣（58Hz 泛音）
	var spectral_drone: float = 0.0
	if _realm_blend > 0.02:
		var drone_wave: float = sin(_time_sec * TAU * 58.0) * 0.65 + sin(_time_sec * TAU * 87.0) * 0.35
		spectral_drone = drone_wave * 0.09 * _realm_blend

	var layer_wind: float = _lp_wind2 * wind_gain * (0.7 + 0.5 * gust_lfo) + spectral_drone

	# ---------------------------------------------------------
	# 层 2：远更鼓梆（乱葬岗中元巡更：远鼓 + 隔拍竹梆）
	# ---------------------------------------------------------
	var layer_watch: float = 0.0
	if is_playing and not is_town:
		_watch_timer -= dt
		if _watch_timer <= 0.0:
			_watch_timer = 7.5 if not _boss_active else 5.2
			_watch_env = 1.0
			_watch_phase = 0.0
			_clapper_delay = 0.42

		if _clapper_delay > 0.0:
			_clapper_delay -= dt
			if _clapper_delay <= 0.0:
				_clapper_env = 1.0
				_clapper_phase = 0.0

		if _watch_env > 0.0005:
			var drum_freq: float = lerpf(44.0, 74.0, _watch_env)
			_watch_phase += TAU * drum_freq * dt
			layer_watch += sin(_watch_phase) * _watch_env * 0.22
			_watch_env *= exp(-dt * 4.8)

		if _clapper_env > 0.0005:
			_clapper_phase += TAU * 920.0 * dt
			var clapper_wave: float = sin(_clapper_phase) * 0.7 + sin(_clapper_phase * 1.49) * 0.3
			layer_watch += clapper_wave * _clapper_env * 0.14
			_clapper_env *= exp(-dt * 19.0)

	# ---------------------------------------------------------
	# 层 3：判官竹篾沙沙（纸扎骨架摩擦 + 干裂高频脉冲）
	# ---------------------------------------------------------
	var layer_boss: float = 0.0
	if _boss_active and is_playing:
		var hp: float = noise - _hp_prev
		_hp_prev = noise * 0.88
		_bp_rustle += (hp - _bp_rustle) * 0.18

		var pulse_rate: float = 5.4 if _boss_phase2 else 2.8
		var bamboo_pulse: float = pow(0.5 + 0.5 * sin(_time_sec * TAU * pulse_rate), 3.0)
		var rustle_amp: float = 0.36 if _boss_phase2 else 0.22
		layer_boss = _bp_rustle * rustle_amp * (0.35 + 0.65 * bamboo_pulse)

		if _boss_phase2:
			var dry_chime: float = sin(_time_sec * TAU * 412.0) * sin(_time_sec * TAU * 1.7)
			layer_boss += dry_chime * 0.045

	var mixed: float = (layer_wind + layer_watch + layer_boss) * _master_gain
	return clampf(mixed, -0.95, 0.95)
