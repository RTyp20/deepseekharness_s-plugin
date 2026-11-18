/**
 * dsh-lock — Client half.
 *
 * A soft lock for the DSH web page: a full-screen gate on launch or reload,
 * plus a sidebar button to lock on demand. It keeps background work running;
 * it only blocks the interface. It is a "keep honest people honest" lock, not
 * a security boundary: disabling the plugin or clearing site data removes it.
 *
 * The gate asks for four things in order: identity name, identity number,
 * permission level, password. All four must match. The security question
 * restores any of them.
 */
window.__ModuleLoader__.load({
  id: 'dsh-identity-gate',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const STORE_KEY = 'dsh-lock:config'
    const SESSION_KEY = 'dsh-lock:session'
    const DEFAULTS = {
      lockOn: 'launch',
      name: '',
      code: '',
      level: '',
      salt: '',
      hash: '',
      question: '',
      answerHash: '',
    }

    // ---------------------------------------------------------------- storage

    function loadConfig() {
      try {
        const raw = window.localStorage.getItem(STORE_KEY)
        if (!raw) return { ...DEFAULTS }
        const parsed = JSON.parse(raw)
        const lockOn =
          parsed.lockOn === 'reload' || parsed.lockOn === 'manual' ? parsed.lockOn : 'launch'
        const str = (value) => (typeof value === 'string' ? value : '')
        return {
          lockOn,
          name: str(parsed.name),
          code: str(parsed.code),
          level: str(parsed.level),
          salt: str(parsed.salt),
          hash: str(parsed.hash),
          question: str(parsed.question),
          answerHash: str(parsed.answerHash),
        }
      } catch {
        return { ...DEFAULTS }
      }
    }

    function persistConfig(config) {
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(config))
      } catch {
        /* private mode or quota: the lock simply will not persist */
      }
    }

    function randomSalt() {
      const bytes = new Uint8Array(16)
      window.crypto.getRandomValues(bytes)
      let out = ''
      for (let i = 0; i < bytes.length; i += 1) out += bytes[i].toString(16).padStart(2, '0')
      return out
    }

    async function digest(text) {
      const data = new TextEncoder().encode(text)
      const buffer = await window.crypto.subtle.digest('SHA-256', data)
      const bytes = new Uint8Array(buffer)
      let out = ''
      for (let i = 0; i < bytes.length; i += 1) out += bytes[i].toString(16).padStart(2, '0')
      return out
    }

    async function hashSecret(salt, secret) {
      return digest(salt + ':' + secret)
    }

    function hasIdentity(config) {
      return Boolean(config.name && config.code && config.level)
    }

    function initialLocked(config) {
      if (!config.hash) return false
      if (config.lockOn === 'manual') return false
      if (config.lockOn === 'reload') return true
      // 'launch': a new window/process locks; a plain page reload does not.
      try {
        return window.sessionStorage.getItem(SESSION_KEY) !== 'unlocked'
      } catch {
        return true
      }
    }

    // ------------------------------------------------------------------ store

    const listeners = new Set()
    const state = { config: loadConfig(), locked: false }
    state.locked = initialLocked(state.config)

    function emit() {
      for (const listener of listeners) listener()
    }

    function patch(next) {
      Object.assign(state, next)
      emit()
    }

    function saveConfig(next) {
      state.config = next
      persistConfig(next)
      emit()
    }

    function lockNow() {
      if (!state.config.hash) {
        window.alert('还没有设置密码。请到「设置 → 锁屏」里先设一个。')
        return
      }
      try {
        window.sessionStorage.removeItem(SESSION_KEY)
      } catch {}
      patch({ locked: true })
    }

    let startupScreenDeferred = false

    // dsh-startup-screen paints its boot animation straight onto <body>,
    // before this page's React tree exists, so it would otherwise cover the
    // password gate. It exposes skip()/replay() on window: stop it while the
    // gate is up, then play it from the start right after unlocking.
    function deferStartupScreen() {
      try {
        const api = window.__DSH_STARTUP_API__
        if (!api || typeof api.skip !== 'function') return false
        if (window.__DSH_STARTUP_RUNNING__ !== true) return false
        api.skip()
        startupScreenDeferred = true
        return true
      } catch {
        return false
      }
    }

    function replayStartupScreen() {
      if (!startupScreenDeferred) return
      startupScreenDeferred = false
      try {
        const api = window.__DSH_STARTUP_API__
        if (api && typeof api.replay === 'function') api.replay()
      } catch {}
    }

    function unlockNow() {
      try {
        window.sessionStorage.setItem(SESSION_KEY, 'unlocked')
      } catch {}
      deferStartupScreen()
      patch({ locked: false })
      replayStartupScreen()
    }

    // Setting a password while already inside must count as this session being
    // unlocked; otherwise the next page reload would lock the owner out.
    function markSessionUnlocked() {
      try {
        window.sessionStorage.setItem(SESSION_KEY, 'unlocked')
      } catch {}
    }

    function useLockState() {
      const [, force] = React.useReducer((x) => x + 1, 0)
      React.useEffect(() => {
        listeners.add(force)
        return () => {
          listeners.delete(force)
        }
      }, [])
      return state
    }

    // ----------------------------------------------------------------- styles

    const overlayStyle = {
      position: 'fixed',
      inset: 0,
      zIndex: 2147483647,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(9, 11, 16, 0.84)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      color: '#eef1f6',
      fontFamily: 'inherit',
    }

    const cardStyle = {
      width: 'min(380px, calc(100vw - 48px))',
      background: 'rgba(26, 29, 36, 0.97)',
      border: '1px solid rgba(255, 255, 255, 0.09)',
      borderRadius: 16,
      padding: '28px 24px 22px',
      boxShadow: '0 30px 80px rgba(0, 0, 0, 0.55)',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }

    const titleStyle = { fontSize: 17, fontWeight: 600, letterSpacing: 0.2 }
    const hintStyle = { fontSize: 12.5, lineHeight: 1.55, color: 'rgba(238, 241, 246, 0.62)' }
    const errorStyle = { fontSize: 12.5, color: '#ff8f8f', minHeight: 17 }

    const inputStyle = {
      width: '100%',
      boxSizing: 'border-box',
      padding: '9px 11px',
      borderRadius: 9,
      border: '1px solid rgba(255, 255, 255, 0.14)',
      background: 'rgba(255, 255, 255, 0.055)',
      color: '#eef1f6',
      fontSize: 13.5,
      outline: 'none',
    }

    const primaryButtonStyle = {
      width: '100%',
      padding: '10px 14px',
      borderRadius: 9,
      border: '1px solid rgba(255, 255, 255, 0.1)',
      background: '#3d6ff2',
      color: '#fff',
      fontSize: 13.5,
      fontWeight: 600,
      cursor: 'pointer',
    }

    const quietButtonStyle = {
      border: 'none',
      background: 'none',
      color: 'rgba(238, 241, 246, 0.66)',
      fontSize: 12.5,
      cursor: 'pointer',
      padding: '4px 0',
      textAlign: 'left',
    }

    // --------------------------------------------------------------- overlay

    function LockOverlay() {
      const snapshot = useLockState()
      const config = snapshot.config
      const [mode, setMode] = React.useState('unlock') // unlock | reset | resetall
      const [nameInput, setNameInput] = React.useState('')
      const [codeInput, setCodeInput] = React.useState('')
      const [levelInput, setLevelInput] = React.useState('')
      const [password, setPassword] = React.useState('')
      const [answer, setAnswer] = React.useState('')
      const [resetName, setResetName] = React.useState('')
      const [resetCode, setResetCode] = React.useState('')
      const [resetLevel, setResetLevel] = React.useState('')
      const [newPassword, setNewPassword] = React.useState('')
      const [confirmPassword, setConfirmPassword] = React.useState('')
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const inputRef = React.useRef(null)

      React.useEffect(() => {
        if (!snapshot.locked) return undefined
        if (inputRef.current) inputRef.current.focus()
        const blockShortcuts = (event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() !== 'v') {
            event.preventDefault()
            event.stopPropagation()
          }
        }
        window.addEventListener('keydown', blockShortcuts, true)
        return () => window.removeEventListener('keydown', blockShortcuts, true)
      }, [snapshot.locked, mode])

      // The overlay stays mounted between locks, so a fresh lock must never
      // show something typed during the previous one.
      React.useEffect(() => {
        if (!snapshot.locked) return
        setNameInput('')
        setCodeInput('')
        setLevelInput('')
        setPassword('')
        setAnswer('')
        setResetName('')
        setResetCode('')
        setResetLevel('')
        setNewPassword('')
        setConfirmPassword('')
        setError('')
        setMode('unlock')
      }, [snapshot.locked])

      // The boot animation can start a moment after this module loads; keep
      // catching it while the gate is up so it never wins the screen.
      React.useEffect(() => {
        if (!snapshot.locked) return undefined
        deferStartupScreen()
        const timer = window.setInterval(deferStartupScreen, 200)
        const stop = window.setTimeout(() => window.clearInterval(timer), 20000)
        return () => {
          window.clearInterval(timer)
          window.clearTimeout(stop)
        }
      }, [snapshot.locked])

      if (!snapshot.locked) return null

      const identity = hasIdentity(config)

      async function submitUnlock(event) {
        event.preventDefault()
        if (busy) return
        setBusy(true)
        setError('')
        try {
          const nameOk = nameInput.trim() === config.name
          const codeOk = codeInput.trim() === config.code
          const levelOk = levelInput.trim() === config.level
          const hash = await hashSecret(config.salt, password)
          const passwordOk = hash === config.hash
          if (nameOk && codeOk && levelOk && passwordOk) {
            setNameInput('')
            setCodeInput('')
            setLevelInput('')
            setPassword('')
            unlockNow()
          } else {
            setError(identity ? '信息不匹配：四项都要对上。' : '密码不对。')
          }
        } finally {
          setBusy(false)
        }
      }

      async function submitAnswer(event) {
        event.preventDefault()
        if (busy) return
        setBusy(true)
        setError('')
        try {
          const hash = await hashSecret(config.salt, answer.trim())
          if (hash === config.answerHash) {
            // The security question restores any of the four fields: prefill
            // the current identity so a forgotten value becomes visible again,
            // and let the owner pick a fresh password.
            setResetName(config.name)
            setResetCode(config.code)
            setResetLevel(config.level)
            setNewPassword('')
            setConfirmPassword('')
            setMode('resetall')
            setError('')
          } else {
            setError('答案不对。')
          }
        } finally {
          setBusy(false)
        }
      }

      async function submitResetAll(event) {
        event.preventDefault()
        if (resetName.trim() === '' || resetCode.trim() === '' || resetLevel.trim() === '') {
          setError('身份名称、编号、等级都要填。')
          return
        }
        if (newPassword.length < 4) {
          setError('新密码至少 4 位。')
          return
        }
        if (newPassword !== confirmPassword) {
          setError('两次输入不一致。')
          return
        }
        const salt = config.salt || randomSalt()
        const hash = await hashSecret(salt, newPassword)
        saveConfig({
          ...config,
          name: resetName.trim(),
          code: resetCode.trim(),
          level: resetLevel.trim(),
          salt,
          hash,
        })
        unlockNow()
      }

      const body = []

      if (mode === 'unlock') {
        body.push(
          h('div', { style: titleStyle, key: 't' }, 'DSH 已锁定'),
          h('div', { style: hintStyle, key: 'h' }, identity ? '输入身份信息与密码，四项都要对。' : '输入密码继续。后台任务仍在运行。'),
          h(
            'form',
            { key: 'f', onSubmit: submitUnlock, style: { display: 'flex', flexDirection: 'column', gap: 10 } },
            identity
              ? h('input', {
                  ref: inputRef,
                  type: 'text',
                  value: nameInput,
                  placeholder: '身份名称',
                  autoComplete: 'off',
                  name: 'dsh-lock-identity-name',
                  style: inputStyle,
                  onChange: (e) => setNameInput(e.target.value),
                })
              : null,
            identity
              ? h('input', {
                  type: 'text',
                  value: codeInput,
                  placeholder: '身份编号',
                  autoComplete: 'off',
                  name: 'dsh-lock-identity-code',
                  style: inputStyle,
                  onChange: (e) => setCodeInput(e.target.value),
                })
              : null,
            identity
              ? h('input', {
                  type: 'text',
                  value: levelInput,
                  placeholder: '权限等级',
                  autoComplete: 'off',
                  name: 'dsh-lock-identity-level',
                  style: inputStyle,
                  onChange: (e) => setLevelInput(e.target.value),
                })
              : null,
            h('input', {
              ref: identity ? undefined : inputRef,
              type: 'password',
              value: password,
              placeholder: '密码',
              autoComplete: 'new-password',
              name: 'dsh-lock-secret',
              style: inputStyle,
              onChange: (e) => setPassword(e.target.value),
            }),
            h('div', { style: errorStyle }, error),
            h('button', { type: 'submit', style: primaryButtonStyle, disabled: busy }, busy ? '验证中…' : '解锁'),
          ),
          config.question
            ? h('button', { key: 'q', type: 'button', style: quietButtonStyle, onClick: () => { setMode('reset'); setError('') } }, '忘记任何一项？')
            : h('div', { key: 'q', style: hintStyle }, '没有设置密保问题。忘了信息的话只能清除本站点数据后重设。'),
        )
      } else if (mode === 'reset') {
        body.push(
          h('div', { style: titleStyle, key: 't' }, '密保问题'),
          h('div', { style: hintStyle, key: 'h' }, config.question),
          h(
            'form',
            { key: 'f', onSubmit: submitAnswer, style: { display: 'flex', flexDirection: 'column', gap: 10 } },
            h('input', {
              ref: inputRef,
              type: 'text',
              value: answer,
              placeholder: '答案',
              autoComplete: 'off',
              style: inputStyle,
              onChange: (e) => setAnswer(e.target.value),
            }),
            h('div', { style: errorStyle }, error),
            h('button', { type: 'submit', style: primaryButtonStyle, disabled: busy }, '确认'),
          ),
          h('button', { key: 'b', type: 'button', style: quietButtonStyle, onClick: () => { setMode('unlock'); setError('') } }, '返回'),
        )
      } else {
        body.push(
          h('div', { style: titleStyle, key: 't' }, '重设身份与密码'),
          h('div', { style: hintStyle, key: 'h' }, '密保已通过。核对下面四项，改完保存即解锁。'),
          h(
            'form',
            { key: 'f', onSubmit: submitResetAll, style: { display: 'flex', flexDirection: 'column', gap: 10 } },
            h('input', {
              ref: inputRef,
              type: 'text',
              value: resetName,
              placeholder: '身份名称',
              autoComplete: 'off',
              style: inputStyle,
              onChange: (e) => setResetName(e.target.value),
            }),
            h('input', {
              type: 'text',
              value: resetCode,
              placeholder: '身份编号',
              autoComplete: 'off',
              style: inputStyle,
              onChange: (e) => setResetCode(e.target.value),
            }),
            h('input', {
              type: 'text',
              value: resetLevel,
              placeholder: '权限等级',
              autoComplete: 'off',
              style: inputStyle,
              onChange: (e) => setResetLevel(e.target.value),
            }),
            h('input', {
              type: 'password',
              value: newPassword,
              placeholder: '新密码（至少 4 位）',
              autoComplete: 'new-password',
              style: inputStyle,
              onChange: (e) => setNewPassword(e.target.value),
            }),
            h('input', {
              type: 'password',
              value: confirmPassword,
              placeholder: '再输一次',
              autoComplete: 'new-password',
              style: inputStyle,
              onChange: (e) => setConfirmPassword(e.target.value),
            }),
            h('div', { style: errorStyle }, error),
            h('button', { type: 'submit', style: primaryButtonStyle }, '保存并解锁'),
          ),
        )
      }

      return h('div', { style: overlayStyle, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'DSH 已锁定' }, h('div', { style: cardStyle }, body))
    }

    // --------------------------------------------------------------- sidebar

    function LockButton(props) {
      const wide = Boolean(props && props.wide)
      return h(
        'button',
        {
          type: 'button',
          title: '锁定 DSH',
          'aria-label': '锁定 DSH',
          onClick: () => {
            if (window.confirm('现在锁定 DSH？')) lockNow()
          },
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: wide ? '7px 10px' : '8px',
            borderRadius: 8,
            border: 'none',
            background: 'transparent',
            color: 'inherit',
            fontSize: 13,
            cursor: 'pointer',
          },
        },
        h('span', { key: 'i', 'aria-hidden': true, style: { fontSize: 14, lineHeight: 1 } }, '🔒'),
        wide ? h('span', { key: 'l' }, '锁定') : null,
      )
    }

    // -------------------------------------------------------------- settings

    function SettingsSection() {
      const snapshot = useLockState()
      const config = snapshot.config
      const [name, setName] = React.useState(config.name)
      const [code, setCode] = React.useState(config.code)
      const [level, setLevel] = React.useState(config.level)
      const [question, setQuestion] = React.useState(config.question)
      const [answer, setAnswer] = React.useState('')
      const [password, setPassword] = React.useState('')
      const [confirm, setConfirm] = React.useState('')
      const [notice, setNotice] = React.useState('')

      const hasPassword = Boolean(config.hash)
      const identity = hasIdentity(config)

      function saveIdentity(event) {
        event.preventDefault()
        if (!name.trim() || !code.trim() || !level.trim()) {
          setNotice('身份名称、编号、等级都要填。')
          return
        }
        saveConfig({ ...config, name: name.trim(), code: code.trim(), level: level.trim() })
        setNotice(identity ? '身份信息已更新。' : '身份信息已保存，解锁时将要求四项。')
      }

      async function savePassword(event) {
        event.preventDefault()
        if (password.length < 4) {
          setNotice('密码至少 4 位。')
          return
        }
        if (password !== confirm) {
          setNotice('两次输入不一致。')
          return
        }
        const salt = randomSalt()
        const hash = await hashSecret(salt, password)
        saveConfig({ ...config, salt, hash })
        markSessionUnlocked()
        setPassword('')
        setConfirm('')
        setNotice('密码已保存。')
      }

      async function saveQuestion(event) {
        event.preventDefault()
        if (!question.trim() || !answer.trim()) {
          setNotice('问题和答案都要填。')
          return
        }
        const salt = config.salt || randomSalt()
        const answerHash = await hashSecret(salt, answer.trim())
        saveConfig({ ...config, salt, answerHash, question: question.trim() })
        setAnswer('')
        setNotice('密保问题已保存。')
      }

      const block = { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }

      return h(
        'div',
        { style: { padding: '4px 2px 28px', maxWidth: 520, color: '#eef1f6' } },
        h('div', { key: 'h', style: { fontSize: 15, fontWeight: 600, marginBottom: 6 } }, '锁屏'),
        h('div', { key: 's', style: hintStyle }, '这是给「别人别随手动我电脑」用的软锁，不是安全产品：禁用插件或清掉站点数据就能绕过。'),
        h('div', { key: 'sp', style: { height: 14 } }),

        h(
          'div',
          { key: 'timing', style: block },
          h('div', { style: { fontSize: 13, fontWeight: 600 } }, '锁定时机'),
          ...[
            ['launch', '启动 DSH 时锁（页面刷新不锁）'],
            ['reload', '每次页面加载都锁（刷新也锁）'],
            ['manual', '只在手动点「锁定」时锁'],
          ].map(([value, text]) =>
            h(
              'label',
              { key: value, style: { display: 'flex', gap: 8, fontSize: 13, cursor: 'pointer' } },
              h('input', {
                type: 'radio',
                name: 'dsh-lock-timing',
                checked: config.lockOn === value,
                onChange: () => saveConfig({ ...config, lockOn: value }),
              }),
              text,
            ),
          ),
        ),

        h(
          'form',
          { key: 'id', onSubmit: saveIdentity, style: block },
          h('div', { style: { fontSize: 13, fontWeight: 600 } }, '身份信息（解锁时要填）'),
          h('input', { type: 'text', value: name, placeholder: '身份名称', autoComplete: 'off', style: inputStyle, onChange: (e) => setName(e.target.value) }),
          h('input', { type: 'text', value: code, placeholder: '身份编号', autoComplete: 'off', style: inputStyle, onChange: (e) => setCode(e.target.value) }),
          h('input', { type: 'text', value: level, placeholder: '权限等级', autoComplete: 'off', style: inputStyle, onChange: (e) => setLevel(e.target.value) }),
          h('button', { type: 'submit', style: { ...primaryButtonStyle, width: 'fit-content', padding: '7px 16px' } }, '保存身份信息'),
        ),

        h(
          'form',
          { key: 'pw', onSubmit: savePassword, style: block },
          h('div', { style: { fontSize: 13, fontWeight: 600 } }, hasPassword ? '修改密码' : '设置密码'),
          h('input', { type: 'password', value: password, placeholder: '新密码（至少 4 位）', autoComplete: 'new-password', style: inputStyle, onChange: (e) => setPassword(e.target.value) }),
          h('input', { type: 'password', value: confirm, placeholder: '再输一次', autoComplete: 'new-password', style: inputStyle, onChange: (e) => setConfirm(e.target.value) }),
          h('button', { type: 'submit', style: { ...primaryButtonStyle, width: 'fit-content', padding: '7px 16px' } }, '保存密码'),
        ),

        h(
          'form',
          { key: 'q', onSubmit: saveQuestion, style: block },
          h('div', { style: { fontSize: 13, fontWeight: 600 } }, '密保问题（忘任何一项时用）'),
          h('input', { type: 'text', value: question, placeholder: '例如：我小学同桌叫什么', autoComplete: 'off', style: inputStyle, onChange: (e) => setQuestion(e.target.value) }),
          h('input', { type: 'text', value: answer, placeholder: '答案', autoComplete: 'off', style: inputStyle, onChange: (e) => setAnswer(e.target.value) }),
          h('button', { type: 'submit', style: { ...primaryButtonStyle, width: 'fit-content', padding: '7px 16px' } }, '保存问题'),
        ),

        h('div', { key: 'n', style: { fontSize: 12.5, minHeight: 18, color: 'rgba(238,241,246,0.72)' } }, notice),
      )
    }

    // ------------------------------------------------------------------ apply

    function apply(ctx) {
      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register({ name: 'shell.overlay', id: 'dsh-lock', order: 0 }, LockOverlay),
      )
      ctx.slots.inject('sidebar.footer.action', () =>
        ctx.slots.register({ name: 'sidebar.footer.action', id: 'dsh-lock', order: 20 }, LockButton),
      )
      ctx.slots.inject('settings.section', () =>
        ctx.slots.register({ name: 'settings.section', id: 'dsh-lock', order: 90, label: '锁屏' }, SettingsSection),
      )
    }

    return { inject: ['slots'], apply }
  },
})
