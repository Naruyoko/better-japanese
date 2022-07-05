const betterJapanese = {
    name: 'betterJapanese',
    apiUrl: {
        release: 'https://pages.yukineko.me/better-japanese/api/release.json',
        dev: '../mods/local/better-japanese/translate.json'
    },
    config: {
        hash: '0',
        replaceJP: true,
        numberJP: true,
        shortFormatJP: false,
        secondFormatJP: true
    },
    isDev: false,
    initialized: false,
    fallbackTimer: 0,
    origins: {},
    formats: {
        prefix: ['', '万', '億', '兆', '京', '垓', '秭', '穣', '溝', '澗', '正', '載', '極', '恒河沙'], // 万進法用の単位
        suffixes: [], // 上数用の単位
        short: [] // 塵劫記用の単位
    },
    isRegisteredHook: false,

    init: function() {
        this.load()

        this.fallbackTimer = setTimeout(() => {
            this.checkUpdate()
            this.initialized = true
        }, 5000)

        if (App) send({ id: 'init bridge' })

        if (!this.isRegisteredHook) this.initAfterLoad()

        // Web版で既にDOMが構築されていた場合はDOMを再構成するスクリプトを読み込む (一部の翻訳が適用されないため)
        if (!App && Game.ready) Game.LoadMod('https://pages.yukineko.me/better-japanese/rebuild.js')

        this.log('Initialized')
    },

    initAfterLoad: async function() {
        // メニューに独自ボタンを実装
        // この方法で実装しないとCCSEなどのメニュー独自実装Modと競合してしまう
        let origin = eval('Game.UpdateMenu.toString()').split('\n')
        origin.splice(origin.length - 1, 0, `
            if (Game.onMenu == 'prefs') {
                betterJapanese.injectMenu()
            } 
            
            if (Game.onMenu == 'stats') {
                betterJapanese.fixStats()
            }
        `)
        eval(`Game.UpdateMenu = ${origin.join('\n')}`)

        // 時間表記からカンマを取り除く
        betterJapanese.origins.sayTime = Game.sayTime
        Game.sayTime = function(time, detail) {
            return betterJapanese.origins.sayTime(time, detail).replaceAll(', ', '')
        }

        // 単位関係の初期化
        for (let suf of ['頻波羅', '矜羯羅', '阿伽羅']) {
            let len = betterJapanese.formats.suffixes.push(suf) - 1
            for (let i = 0; i < len; i++) {
                betterJapanese.formats.suffixes.push(betterJapanese.formats.suffixes[i] + suf)
            }
        }

        betterJapanese.formats.suffixes = ['', ...betterJapanese.formats.suffixes]

        // 塵劫記用の単位
        betterJapanese.formats.short = [...betterJapanese.formats.prefix, '阿僧祇', '那由多', '不可思議', '無量大数']

        // 本家の挿入関数に追加
        numberFormatters = [
            formatEveryThirdPower(formatShort),
            formatEveryThirdPower(formatLong),
            rawFormatter,
            betterJapanese.formatEveryFourthPower()
        ]

        // 設定によって日本語単位を使用するように変更、同時にカンマ区切りも場合によって変更
        betterJapanese.origins.beautify = Beautify
        Beautify = function(val, floats) {
            let negative = (val < 0)
            let decimal = ''
            let fixed = val.toFixed(floats)
            if (floats > 0 && Math.abs(val) < 1000 && Math.floor(fixed) != fixed) decimal = '.' + (fixed.toString()).split('.')[1]
            val = Math.floor(Math.abs(val))
            if (floats > 0 && fixed == val + 1) val++
            let format = Game.prefs.format ? 2 : betterJapanese.config.numberJP ? 3 : 1
            let formatter = numberFormatters[format]
            let output = (val.toString().indexOf('e+') != -1 && format == 2) ? val.toPrecision(3).toString() : formatter(val).toString()
            if (Game.prefs.format || (betterJapanese.config.numberJP && betterJapanese.config.secondFormatJP)) {
                output = output.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
            } else {
                output = output.replace(/^(\d)(\d{3})/, '$1,$2')
            }
            if (output == '0') negative = false
            return negative ? '-' + output : output + decimal
        }

        // 背景の名前を翻訳
        for (let i = 1; i < Game.AllBGs.length; i++) {
            Game.AllBGs[i].enName = Game.AllBGs[i].name
            Game.AllBGs[i].name = loc(Game.AllBGs[i].enName)
        }

        // カスタムCSSを適用
        let customStyle = document.createElement('style')
        customStyle.innerHTML = `
        .framed q:before {
            display:inline-block;
            content:"「" !important;
            font-size:14px;
            font-family:Georgia;
            font-weight:bold;
        }

        .framed q:after {
            display:inline-block;
            content:"」" !important;
            font-size:14px;
            font-family:Georgia;
            font-weight:bold;
            margin-top:-2px;
        }
        `

        document.head.appendChild(customStyle)

        // 在庫市場のquoteを実装
        while (!Game.Objects['Bank'].hasOwnProperty('minigame')) await new Promise(resolve => setTimeout(resolve, 1000))
        if (typeof(betterJapanese.origins.goodTooltip) === 'undefined') {
            betterJapanese.origins.goodTooltip = Game.Objects['Bank'].minigame.goodTooltip
        }
        Game.Objects['Bank'].minigame.goodTooltip = function(id) {
            return function() {
                let desc = betterJapanese.origins.goodTooltip(id)()
                const qbefore = '<div class="line"></div>'
                let qpos = desc.indexOf(qbefore) + qbefore.length
                return `${desc.substring(0, qpos)}<div class="description"><q>${loc(Game.Objects['Bank'].minigame.goodsById[id].desc)}</q><div class="line">${desc.substring(qpos)}`
            }
        }

        // 情報欄の翻訳
        betterJapanese.origins.updateLog = Game.updateLog
        Game.updateLog = `
            <div class="selectable">
	            <div class="section">${loc('Info')}</div>
	            <div class="subsection">
	                <div class="title">${loc('About')}</div>
    	            ${(App ? `<div class="listing" style="font-weight:bold;font-style:italic;opacity:0.5;">${loc('Note: links will open in your web browser.')}</div>` : '')}
	                <div class="listing">
                        ${loc('Cookie Clicker is a javascript game by %1 and %2.', [
                            '<a href="//orteil.dashnet.org" target="_blank">Orteil</a>',
                            '<a href="//dashnet.org" target="_blank">Opti</a>'
                        ])}
                    </div>
	                ${(App ? `<div class="listing">${loc('Music by %1.', '<a href="https://twitter.com/C418" target="_blank">C418</a>')}</div>` : '')}
	                <div class="listing">
                        ${loc('We have an %1; if you\'re looking for help, you may also want to visit the %2 or the %3.<br>News and teasers are usually posted on Orteil\'s %4 and %5.', [
                            `<a href="https://discordapp.com/invite/cookie" target="_blank">${loc('official Discord')}</a>`,
                            '<a href="https://www.reddit.com/r/CookieClicker" target="_blank">subreddit</a>',
		                    '<a href="https://cookieclicker.wikia.com/wiki/Cookie_Clicker_Wiki" target="_blank">wiki</a>',
		                    '<a href="https://orteil42.tumblr.com/" target="_blank">tumblr</a>',
		                    '<a href="https://twitter.com/orteil42" target="_blank">twitter</a>',
		                ])}
	                </div>
                    ${(!App ? `<div class="listing block" style="margin:8px 32px;font-size:11px;line-height:110%;color:rgba(200,200,255,1);background:rgba(128,128,255,0.15);" id="supportSection">
                        ${loc('This version of Cookie Clicker is 100% free, forever. Want to support us so we can keep developing games? Here\'s some ways you can help:%1', [`<br><br>
                            &bull; ${loc('get %1 (it\'s about 5 bucks)', `<a href="https://store.steampowered.com/app/1454400/Cookie_Clicker/" target="_blank" class="highlightHover smallWhiteButton">${loc('Cookie Clicker on Steam')}</a>`)}<br><br>
                            &bull; ${loc('support us on %1 (there\'s perks!)', '<a href="https://www.patreon.com/dashnet" target="_blank" class="highlightHover smallOrangeButton">Patreon</a>')}<br><br>
                            &bull; ${loc('check out our %1 with rad cookie shirts, hoodies and stickers', `<a href="http://www.redbubble.com/people/dashnet" target="_blank" class="highlightHover smallWhiteButton">${loc('Shop')}</a>`)}<br><br>
                            &bull; ${loc('disable your adblocker (if you want!)')}
                        `])}
                    </div>
                </div>` : '')}
                <div class="listing warning">${loc('Note: if you find a new bug after an update and you\'re using a 3rd-party add-on, make sure it\'s not just your add-on causing it!')}</div>
                ${(!App ? (`<div class="listing warning">
                    ${loc('Warning: clearing your browser cache or cookies <small>(what else?)</small> will result in your save being wiped. Export your save and back it up first!')}
                </div>`) : '')}
            </div>
            <div class="subsection">
                <div class="title">${loc('Version history')}</div>`
        let logUpdates = ''
        let logPerUpdate = ''
        let logIndex = ''
        let logResult = []
        let logId = 0
        while (typeof(logIndex = FindLocStringByPart(`Update notes ${logId}`)) === 'string' && typeof(logResult = loc(logIndex)) === 'object' && logResult.length > 1) {
            let logOptions = logIndex.substring(logIndex.indexOf(']') + 1).split('|')
            let isSmallList = false, isAppList = false
            if (logOptions.includes('small')) isSmallList = true
            if (logOptions.includes('app')) isAppList = true
            if ((App && isAppList) || !isAppList) {
                logPerUpdate = `<div class="subsection update${isSmallList ? ' small' : ''}">`
                logPerUpdate += `<div class="title">${logResult[0]}</div>`
                for (let i = 1; i < logResult.length; i++) {
                    let options = logResult[i].split('|')
                    let str = options.pop()
                    let isAppItem = false
                    if (options.length > 0) {
                        if (options.includes('app')) isAppItem = true
                    }
                    if ((App && isAppItem) || !isAppItem) {
                        str = str.replaceAll('[Update Log General Names]', choose(loc('[Update Log General Names]')))
                        logPerUpdate += `<div class="listing">${str}</div>`
                    }
                }
                logUpdates = `${logPerUpdate}</div>${logUpdates}`
            }
            logId++
        }
        Game.updateLog += `</div>${logUpdates}</div></div>`

        // 巡り続ける読本のフレーバーテキスト翻訳、thisを使うので非ラムダ式(以降同様)
        let upgrade = Game.Upgrades['Endless book of prose']
        upgrade.desc = loc('%1 are <b>twice</b> as efficient.', cap(upgrade.buildingTie1.plural))
        upgrade.originDescFunc = upgrade.descFunc
        upgrade.descFunc = function() {
            let str = loc(FindLocStringByPart(`Upgrade quote ${this.id}`), Game.bakeryName)
            let n = 26
            let i = Math.floor(Game.T * 0.1)
            let originDesc = this.originDescFunc()
            if(originDesc.indexOf('<q>') >= 0) {
                originDesc = originDesc.substring(0, originDesc.indexOf('<q>'))
            }
            return `${originDesc}<q style="font-family:Courier;">${str.substr(i % str.length, n) + (i % str.length > (str.length - n) ? str.substr(0, i % str.length - (str.length - n)) : '')}</q>`
        }

        // マウス達をクリックするマウス達のフレーバーテキスト翻訳
        upgrade = Game.Upgrades['Mice clicking mice']
        upgrade.desc = betterJapanese.createSynergyUpgradeDesc(upgrade)
        upgrade.descFunc = function() {
            Math.seedrandom(Game.seed + '-blasphemouse')
            if (Math.random() < 0.3) {
                Math.seedrandom()
                return `${this.desc}<q>${loc(FindLocStringByPart(`Upgrade quote ${this.id}`))}</q>`
            }
            
            Math.seedrandom()
            return `${this.desc}<q>${loc('Mice clicking mice (Absolutely blasphemouse!)')}</q>`
        }

        // 富くじ演算のフレーバーテキスト翻訳
        upgrade = Game.Upgrades['Tombola computing']
        upgrade.desc = betterJapanese.createSynergyUpgradeDesc(upgrade)
        upgrade.descFunc = function() {
            Math.seedrandom(Game.seed + '-tombolacomputing')
            let str = loc(FindLocStringByPart(`Upgrade quote ${this.id}`), [
                Math.floor(Math.random() * 100),
                Math.floor(Math.random() * 100),
                Math.floor(Math.random() * 100),
                Math.floor(Math.random() * 100),
                parseLoc(choose(loc('Tombola computing (Base)')), [
                    Math.floor(Math.random() * 5 + 2),
                    choose(loc('Tombola computing (Color)')),
                    choose(loc('Tombola computing (Living)'))
                ])
            ])
            Math.seedrandom()
            return `${this.desc}<q>${str}</q>`
        }

        // 一級品の壁紙アソートメントの説明翻訳
        upgrade = Game.Upgrades['Distinguished wallpaper assortment'].desc = loc('Contains more wallpapers for your background selector.')

        // ゴールデンスイッチの説明翻訳
        let func = function() {
            if (!Game.Has('Residual luck')) return this.ddesc

            let bonus = 0
            let upgrades = Game.goldenCookieUpgrades
            for (let i in upgrades) {
                if (Game.Has(upgrades[i])) bonus++
            }

            return `<div style="text-align:center;">${Game.listTinyOwnedUpgrades(Game.goldenCookieUpgrades)}<br><br>${loc('The effective boost is <b>+%1%</b><br>thanks to %2<br>and your <b>%3</b> %4.', [Beautify(Math.round(50 + bonus * 10)), getUpgradeName('Residual luck'), bonus, loc('golden cookie upgrade', bonus)])}</div><div class="line"></div>${this.ddesc}`
        }

        Game.Upgrades['Golden switch [off]'].descFunc = func
        Game.Upgrades['Golden switch [on]'].descFunc = func

        // 猫の場合「購入済み」タグが変化することを翻訳にも反映
        betterJapanese.origins.crateTooltip = Game.crateTooltip
        Game.crateTooltip = function(me, context) {
            let tooltipText = betterJapanese.origins.crateTooltip(me, context)
            if(Game.sesame) {
                tooltipText = tooltipText.replace(/<div style="font-size:9px;">.*<\/div>/, `<div style="font-size:9px;">ID : ${me.id} | 順序 : ${Math.floor(me.order)}${me.tier ? ` | ティア : ${me.tier}` : ''}</div>`)
            }
            if(me.type == 'upgrade' && me.bought > 0 && me.pool != 'tech' && me.kitten) {
                return tooltipText.replace(`<div class="tag" style="background-color:#fff;">${loc('Purchased')}</div>`, `<div class="tag" style="background-color:#fff;">${loc('[Tag]Purrchased')}</div>`)
            }
            
            return tooltipText
        }

        // 英語以外でも施設固有の生産方法をツールチップに表示
        for (let i in Game.Objects) {
            let obj = Game.Objects[i]
            if (typeof (betterJapanese.origins.tooltip) === 'undefined') {
                betterJapanese.origins.tooltip = obj.tooltip
            }
            obj.actionNameJP = loc(obj.actionName)
            obj.tooltip = function() {
                const strDivDescriptionBlock = '<div class="descriptionBlock">'
                let defaultTooltip = betterJapanese.origins.tooltip.bind(this)().split(strDivDescriptionBlock)
                // Game.Object[X].tooltipのdescriptionBlockは存在しないか4つのどちらか
                if (defaultTooltip.length > 1) {
                    defaultTooltip[4] = loc('<b>%1</b> %2 so far', [loc('%1 cookie', LBeautify(this.totalCookies)), this.actionNameJP]) + '</div>'
                    return defaultTooltip.join(strDivDescriptionBlock) + '</div>'
                }
                return defaultTooltip
            }
        }

        // 英語以外でも施設固有の角砂糖によるレベルアップの恩恵を表示
        for (let i in Game.Objects) {
            let obj = Game.Objects[i]
            if (typeof (betterJapanese.origins.levelTooltip) === 'undefined') {
                betterJapanese.origins.levelTooltip = obj.levelTooltip
            }
            obj.levelTooltip = function() {
                const strDivLine = '<div class="line"></div>'
                let defaultTooltip = betterJapanese.origins.levelTooltip.bind(this)().split(strDivLine)
                defaultTooltip[1] = `${loc(this.extraName.replace('[X]', '%1'), Beautify(this.level))} ${loc('Granting <b>+%1% %2 CpS</b>.', [Beautify(this.level), this.single])}`
                return defaultTooltip.join(strDivLine)
            }
        }

        // ニュースのフォーチュンクッキーの表示が壊れる問題を修正
        let tickerOrigin = eval('Game.getNewTicker.toString()').replace('me.name.indexOf(\'#\')', 'me.dname.indexOf(\'No.\')').replace(/me\.baseDesc/g, 'me.ddesc')
        eval(`Game.getNewTicker = ${tickerOrigin}`)

        // ニュースを英語で出力させるように
        betterJapanese.origins.getNewTicker = Game.getNewTicker
        Game.getNewTicker = function(manual) {
            let isDefaultEN = EN
            EN = true
            betterJapanese.origins.getNewTicker(manual)
            if (!isDefaultEN) EN = false
        }

        // ニュースの文章を翻訳
        betterJapanese.origins.tickerDraw = Game.TickerDraw
        Game.TickerDraw = function() {
            Game.Ticker = betterJapanese.locTicker(Game.Ticker)
            betterJapanese.origins.tickerDraw()
        }

        betterJapanese.origins.parseLoc = parseLoc
        parseLoc = function(str, params) {
            // 独自実装されている翻訳でコケないように修正
            if (str.constructor === Object) return ''

            // 翻訳対象の文章の末尾に%が付いている場合に消えてしまう問題を修正
            let baseStr = betterJapanese.origins.parseLoc(str, params)
            if (typeof str === 'string' && str.endsWith('%')) baseStr += '%'
            return baseStr
        }

        // hookを削除
        Game.removeHook('create', betterJapanese.initAfterLoad)
    },

    register: function() {
        Game.registerMod(this.name, this)
        if (!Game.ready) {
            Game.registerHook('create', betterJapanese.initAfterLoad)
            this.isRegisteredHook = true
        }
    },

    save: function() {
        localStorage.setItem('BJPConfig', JSON.stringify(this.config))
    },

    load: function() {
        let conf = localStorage.getItem('BJPConfig')
        if (conf) this.config = JSON.parse(conf)
    },

    log: function(msg) {
        console.log(`%c[BetterJapanese]%c ${msg}`, 'color: yellow', '')
    },

    injectMenu: function() {
        let updateAll = () => {
            BeautifyAll()
            Game.RefreshStore()
            Game.upgradesToRebuild = 1
        }
        this.writeButton('toggleBJPButton', 'replaceJP', '日本語訳の改善', '日本語訳を非公式翻訳版に置き換えます。変更は再起動後に適用されます。', updateAll)
        // this.writeButton('openIgnoreWordList', null, '置き換え除外リスト', '非公式翻訳に置き換えたくない単語を指定することができます。', betterJapanese.openIgnorePrompt)
        this.writeButton('toggleNumberJPButton', 'numberJP', '日本語単位', '数の単位に日本語単位を用います。', updateAll)
        this.writeButton('toggleShortFormatJPButton', 'shortFormatJP', '塵劫記単位', '数の単位に塵劫記の単位(阿僧祇～無量大数)を用います。', updateAll)
        this.writeButton('toggleSecondFormatJPButton', 'secondFormatJP', '第二単位', `${loc('ON')}の場合はXXXX億YYYY万、${loc('OFF')}の場合はXXXX.YYYY億のように表示されます。`, updateAll)
    },

    fixStats: function() {
        const strLegacyStarted = '<div class="listing"><b>' + loc('Legacy started:') + '</b>'
        l('menu').innerHTML = l('menu').innerHTML.replace(new RegExp(strLegacyStarted + ' (.+?), (.+?)</div>'), strLegacyStarted + ' $1、$2</div>')
    },

    writeButton: function(buttonId, targetProp = null, desc, label = null, callback = null, targetElementName = 'monospaceButton') {
        // 本家のWritePrefButtonとほぼ同じ

        // ボタンを追加する先の要素を指定 (デフォルトはmonospaceButton)
        let targetElement = l(targetElementName)

        // 仕様の都合上、最初に改行タグを追加
        targetElement.parentNode.insertBefore(document.createElement('br'), targetElement.previousElementSibling)

        // ボタンを生成
        let elementButton = document.createElement('a')
        elementButton.className = 'smallFancyButton option'
        if (targetProp) elementButton.className += ` prefButton ${this.config[targetProp] ? 'on' : 'off'}` 
        elementButton.id = buttonId

        let onclickStr = targetProp ? `betterJapanese.toggleButton('${buttonId}', '${targetProp}', '${desc}');` : ''

        // Callbackが存在し、なおかつ与えられた引数がfunctionであればCallbackを追加
        if (callback && typeof callback === 'function') onclickStr += `(${callback.toString()})()`

        elementButton.setAttribute(Game.clickStr, onclickStr)

        elementButton.innerText = desc

        if (targetProp) elementButton.innerText += ` ${this.config[targetProp] ? loc('ON') : loc('OFF')}`

        targetElement.parentNode.insertBefore(elementButton, targetElement.previousElementSibling)

        // ラベルがあれば生成
        if (label) {
            let elementLabel = document.createElement('label')
            elementLabel.innerText = `(${label})`
            targetElement.parentNode.insertBefore(elementLabel, targetElement.previousElementSibling)
        }
    },

    toggleButton: function(buttonId, targetProp, desc) {
        let button = l(buttonId)
        betterJapanese.config[targetProp] = !betterJapanese.config[targetProp]
        button.className = `smallFancyButton prefButton option ${this.config[targetProp] ? 'on' : 'off'}`
        button.innerText = `${desc} ${this.config[targetProp] ? loc('ON') : loc('OFF')}`
        PlaySound('snd/tick.mp3')
    },

    addDevButton: function() {
        let element = document.createElement('div')
        element.innerHTML = '<button style="position: absolute; left: 10px; top: 10px; z-index: 9999;" type="button" onclick="betterJapanese.reloadLanguagePack()">Reload LanguageFile</button>'
        document.body.append(element)
    },

    checkUpdate: async function() {
        this.log('Checking updates')

        if (this.isDev) return await this.updateLanguagePack(this.apiUrl.dev)
        let res = await fetch(this.apiUrl.release).then(res => res.json()).catch((err) => {
            this.log(`An error occurred while checking for updates: ${err}`)
            return this.config
        })

        if (res.hash !== this.config.hash) {
            if (await this.updateLanguagePack(res.url)) {
                this.config.hash = res.hash
                this.save()
                this.showUpdateNotification()
            }
        } else {
            this.log('No updates available')
        }
    },

    showUpdateNotification: function() {
        Game.Notify('日本語訳改善Mod', '翻訳データを更新しました。<br>再読み込み後から有効になります。<br><a onclick="betterJapanese.reload()">セーブデータを保存して再読み込み</a>')
    },

    reload: function() {
        Game.toSave = true
        Game.toReload = true
    },

    reloadLanguagePack: async function() {
        await this.checkUpdate()
        this.showUpdateNotification()
        ModLanguage('JA', JSON.parse(localStorage.getItem('BJPLangPack')))
    },

    updateLanguagePack: async function(url) {
        let base = {
            '': {
                'language': 'JA',
                'plural-forms': 'nplurals=2;plural=(n!=1);'
            },
        }

        try {
            let lang = await fetch(url).then(res => res.json())
            localStorage.setItem('BJPLangPack', JSON.stringify(Object.assign(base, lang)))
        } catch {
            this.log('Update failed')
            return false
        }

        this.log('Update successfull')
        return true
    },

    formatEveryFourthPower: function() {
        // 接尾辞挿入の4桁区切り版、secondで第二単位の使用を指定
        return function(value) {
            let prefixes = betterJapanese.config.shortFormatJP ? betterJapanese.formats.short : betterJapanese.formats.prefix
            let suffixes = betterJapanese.config.shortFormatJP ? [''] : betterJapanese.formats.suffixes
            let second = betterJapanese.config.secondFormatJP

            // infinityの場合は無限大を返す
            if (!isFinite(value)) return '無限大'// loc("Infinity")

            if (value > 10 ** (prefixes.length * suffixes.length * 4)) {
                return value.toPrecision(3).toString()
            }

            // 小数点の場合は最大小数第3位まででそのまま出力
            if (value < 1) {
                return (Math.round(value * 1000) / 1000).toString()
            }

            let numeral = Math.floor(Math.log10(value) / 4)
            let preIndex = numeral % prefixes.length
            let sufIndex = Math.floor(numeral / prefixes.length)
            let dispNum = Math.round(value * 10000 / (10 ** (numeral * 4)))

            // 第二単位を付ける
            if (second) {
                if (!preIndex && !sufIndex) return value

                let str = Math.floor(dispNum / 10000) + (preIndex ? prefixes[preIndex] : suffixes[sufIndex])
                if (dispNum % 10000) str += (dispNum % 10000) + prefixes[preIndex ? preIndex - 1 : prefixes.length - 1]
                str += suffixes[preIndex ? sufIndex : sufIndex - 1]

                return str !== 'NaN' ? str : value.toPrecision(3).toString()

            } 

            // 第二単位を付けない
            return Math.round(value * 10000 / (10 ** (numeral * 4))) / 10000 + prefixes[preIndex] + suffixes[sufIndex]
        }
    },

    createSynergyUpgradeDesc: function(upgrade) {
        return `${loc('%1 gain <b>+%2%</b> CpS per %3.', [cap(upgrade.buildingTie1.plural), 5, upgrade.buildingTie2.single])}<br>${loc('%1 gain <b>+%2%</b> CpS per %3.', [cap(upgrade.buildingTie2.plural), 0.1, upgrade.buildingTie1.single])}`
    },

    openIgnorePrompt: function() {
        Game.Prompt('非公式翻訳の置き換え除外リスト', ['保存', 'キャンセル'])
    },

    locTicker: function(tickerText) {
        let baseTickerText = tickerText
        let newsRegex = /N.*ws : /
        let isStartWithHtmlTag = tickerText.startsWith('<')
        let isContainsNewsText = tickerText.match(newsRegex)

        // "News : "があれば除去
        let ticker = isContainsNewsText ? tickerText.replace(newsRegex, '') : tickerText

        // htmlタグが含まれている場合はタグを除去
        if (isStartWithHtmlTag) ticker = ticker.replace(/<("[^"]*"|'[^']*'|[^'">])*>/g, '')

        // 翻訳
        let localizedStr = betterJapanese.replaceString(ticker)

        // 先程削除したNewsを追加 (含んでいなければ何もしない)
        if (isContainsNewsText) localizedStr = loc('News :').replace(' ', '&nbsp;') + ' ' + localizedStr

        // htmlタグが含まれている場合はタグを追加
        if (isStartWithHtmlTag) localizedStr = baseTickerText.replace(ticker, localizedStr)

        return localizedStr
    },

    replaceString(str) {
        // locStringsから探して見つかれば返す
        let staticLocStr = locStrings[str]
        if(staticLocStr) return staticLocStr

        // 動的なニュース(Ticker (Dynamic))のリストが読み込めていなければそのまま返す
        let dynamicLocList = locStrings['Ticker (Dynamic)']
        if (!dynamicLocList) return str

        // 動的ニュースリストから対象のニュースを探す
        let targetStr = Object.keys(dynamicLocList).find((text) => {
            // エスケープが必要な文字をエスケープしてから動的な部分 (%1や%2など) を置き換え
            return betterJapanese.getReplacedRegex(text).test(str)
        })

        if (!targetStr) return str

        let dynamicLocStr = dynamicLocList[targetStr]

        // 置き換える単語を取得
        let strParams = betterJapanese.getReplacedRegex(targetStr).exec(str)

        console.log(strParams)

        // 置き換え
        for (let i = 0; i < strParams.length - 1; i++) {
            dynamicLocStr = dynamicLocStr.replace(`%${i + 1}`, betterJapanese.replaceString(strParams[i + 1]))
        }

        return dynamicLocStr
    },

    getReplacedRegex: function(str, splitRegex = /%\d+/g) {
        return new RegExp(str.replace(/(\\|\*|\+|\.|\?|\{|\}|\(|\)|\^|\$|\|)/g, '\\$1').replace(splitRegex, '(.*)'), 'g')
    },
    
    devCheck: function(isDev = false) {
        if (betterJapanese.initialized) return

        betterJapanese.isDev = betterJapanese.isDev || isDev
        betterJapanese.checkUpdate()
        betterJapanese.log(`DevMode: ${betterJapanese.isDev}`)
        if (betterJapanese.isDev) betterJapanese.addDevButton()
        clearTimeout(betterJapanese.fallbackTimer)
        betterJapanese.initialized = true
    }
}

if (App) {
    window.api.receive('fromMain', (msg) => {
        if (msg.id === 'greenworks loaded') {
            betterJapanese.devCheck(!!msg.data.DEV)
        }
    })
} else {
    betterJapanese.devCheck(false)
}

betterJapanese.register()
