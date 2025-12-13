import * as React from "react"
import intl from "react-intl-universal"
import { renderToString } from "react-dom/server"
import { RSSItem } from "../scripts/models/item"
import {
    Stack,
    CommandBarButton,
    IContextualMenuProps,
    FocusZone,
    ContextualMenuItemType,
    Spinner,
    Icon,
    Link,
    ProgressIndicator,
} from "@fluentui/react"
import {
    RSSSource,
    SourceOpenTarget,
    SourceTextDirection,
} from "../scripts/models/source"
import { shareSubmenu } from "./context-menu"
import { platformCtrl, decodeFetchResponse } from "../scripts/utils"
import { TtsSession } from "@mintplex-labs/piper-tts-web"
import { env } from "onnxruntime-web"

// --- GLOBAL CONFIGURATION ---
// With ASAR disabled, 'article.html' lives in /dist/article/
// and WASM files live in /dist/wasm/
// Therefore, "../wasm/" is the correct, standard relative path.
const WASM_REL_PATH = '../wasm/';

try {
    // Force ONNX to look in the relative path
    // @ts-ignore
    env.wasm.wasmPaths = WASM_REL_PATH;
    console.log("TTS: Configured WASM path to:", WASM_REL_PATH);
} catch (e) {
    console.error("TTS: Failed to set global ONNX config:", e);
}
// ----------------------------

const FONT_SIZE_OPTIONS = [12, 13, 14, 15, 16, 17, 18, 19, 20]

type ArticleProps = {
    item: RSSItem
    source: RSSSource
    locale: string
    shortcuts: (item: RSSItem, e: KeyboardEvent) => void
    dismiss: () => void
    offsetItem: (offset: number) => void
    toggleHasRead: (item: RSSItem) => void
    toggleStarred: (item: RSSItem) => void
    toggleHidden: (item: RSSItem) => void
    textMenu: (position: [number, number], text: string, url: string) => void
    imageMenu: (position: [number, number]) => void
    dismissContextMenu: () => void
    updateSourceTextDirection: (
        source: RSSSource,
        direction: SourceTextDirection
    ) => void
}

type ArticleState = {
    fontFamily: string
    fontSize: number
    loadWebpage: boolean
    loadFull: boolean
    fullContent: string
    loaded: boolean
    error: boolean
    errorDescription: string
    isReading: boolean
    isLoadingTTS: boolean
    ttsDownloadProgress: number
}

class Article extends React.Component<ArticleProps, ArticleState> {
    webviewRef = React.createRef<Electron.WebviewTag>()
    webview: Electron.WebviewTag | null = null
    
    // TTS Resources
    audioPlayer: HTMLAudioElement | null = null
    currentBlobUrl: string | null = null
    activeRequestId: number = 0
    ttsSession: TtsSession | null = null

    constructor(props: ArticleProps) {
        super(props)
        this.state = {
            fontFamily: window.settings.getFont(),
            fontSize: window.settings.getFontSize(),
            loadWebpage: props.source.openTarget === SourceOpenTarget.Webpage,
            loadFull: props.source.openTarget === SourceOpenTarget.FullContent,
            fullContent: "",
            loaded: false,
            error: false,
            errorDescription: "",
            isReading: false,
            isLoadingTTS: false,
            ttsDownloadProgress: 0,
        }
        window.utils.addWebviewContextListener(this.contextMenuHandler)
        window.utils.addWebviewKeydownListener(this.keyDownHandler)
        window.utils.addWebviewErrorListener(this.webviewError)
        if (props.source.openTarget === SourceOpenTarget.FullContent)
            this.loadFull()
    }

    setFontSize = (size: number) => {
        window.settings.setFontSize(size)
        this.setState({ fontSize: size })
    }
    
    setFont = (font: string) => {
        window.settings.setFont(font)
        this.setState({ fontFamily: font })
    }

    fontSizeMenuProps = (): IContextualMenuProps => ({
        items: FONT_SIZE_OPTIONS.map(size => ({
            key: String(size),
            text: String(size),
            canCheck: true,
            checked: size === this.state.fontSize,
            onClick: () => this.setFontSize(size),
        })),
    })

    fontFamilyMenuProps = (): IContextualMenuProps => ({
        items: window.fontList.map((font, idx) => ({
            key: String(idx),
            text: font === "" ? intl.get("default") : font,
            canCheck: true,
            checked: this.state.fontFamily === font,
            onClick: () => this.setFont(font),
        })),
    })

    updateTextDirection = (direction: SourceTextDirection) => {
        this.props.updateSourceTextDirection(this.props.source, direction)
    }

    directionMenuProps = (): IContextualMenuProps => ({
        items: [
            {
                key: "LTR",
                text: intl.get("article.LTR"),
                iconProps: { iconName: "Forward" },
                canCheck: true,
                checked: this.props.source.textDir === SourceTextDirection.LTR,
                onClick: () =>
                    this.updateTextDirection(SourceTextDirection.LTR),
            },
            {
                key: "RTL",
                text: intl.get("article.RTL"),
                iconProps: { iconName: "Back" },
                canCheck: true,
                checked: this.props.source.textDir === SourceTextDirection.RTL,
                onClick: () =>
                    this.updateTextDirection(SourceTextDirection.RTL),
            },
            {
                key: "Vertical",
                text: intl.get("article.Vertical"),
                iconProps: { iconName: "Down" },
                canCheck: true,
                checked:
                    this.props.source.textDir === SourceTextDirection.Vertical,
                onClick: () =>
                    this.updateTextDirection(SourceTextDirection.Vertical),
            },
        ],
    })

    moreMenuProps = (): IContextualMenuProps => ({
        items: [
            {
                key: "openInBrowser",
                text: intl.get("openExternal"),
                iconProps: { iconName: "NavigateExternalInline" },
                onClick: e => {
                    window.utils.openExternal(
                        this.props.item.link,
                        platformCtrl(e)
                    )
                },
            },
            {
                key: "copyURL",
                text: intl.get("context.copyURL"),
                iconProps: { iconName: "Link" },
                onClick: () => {
                    window.utils.writeClipboard(this.props.item.link)
                },
            },
            {
                key: "toggleHidden",
                text: this.props.item.hidden
                    ? intl.get("article.unhide")
                    : intl.get("article.hide"),
                iconProps: {
                    iconName: this.props.item.hidden ? "View" : "Hide3",
                },
                onClick: () => {
                    this.props.toggleHidden(this.props.item)
                },
            },
            {
                key: "fontMenu",
                text: intl.get("article.font"),
                iconProps: { iconName: "Font" },
                disabled: this.state.loadWebpage,
                subMenuProps: this.fontFamilyMenuProps(),
            },
            {
                key: "fontSizeMenu",
                text: intl.get("article.fontSize"),
                iconProps: { iconName: "FontSize" },
                disabled: this.state.loadWebpage,
                subMenuProps: this.fontSizeMenuProps(),
            },
            {
                key: "directionMenu",
                text: intl.get("article.textDir"),
                iconProps: { iconName: "ChangeEntitlements" },
                disabled: this.state.loadWebpage,
                subMenuProps: this.directionMenuProps(),
            },
            {
                key: "divider_1",
                itemType: ContextualMenuItemType.Divider,
            },
            ...shareSubmenu(this.props.item),
        ],
    })

    contextMenuHandler = (pos: [number, number], text: string, url: string) => {
        if (pos) {
            if (text || url) this.props.textMenu(pos, text, url)
            else this.props.imageMenu(pos)
        } else {
            this.props.dismissContextMenu()
        }
    }

    keyDownHandler = (input: Electron.Input) => {
        if (input.type === "keyDown") {
            switch (input.key) {
                case "Escape":
                    this.props.dismiss()
                    break
                case "ArrowLeft":
                case "ArrowRight":
                    this.props.offsetItem(input.key === "ArrowLeft" ? -1 : 1)
                    break
                case "l":
                case "L":
                    this.toggleWebpage()
                    break
                case "w":
                case "W":
                    this.toggleFull()
                    break
                case "H":
                case "h":
                    if (!input.meta) this.props.toggleHidden(this.props.item)
                    break
                default:
                    const keyboardEvent = new KeyboardEvent("keydown", {
                        code: input.code,
                        key: input.key,
                        shiftKey: input.shift,
                        altKey: input.alt,
                        ctrlKey: input.control,
                        metaKey: input.meta,
                        repeat: input.isAutoRepeat,
                        bubbles: true,
                    })
                    this.props.shortcuts(this.props.item, keyboardEvent)
                    document.dispatchEvent(keyboardEvent)
                    break
            }
        }
    }

    webviewLoaded = () => {
        this.setState({ loaded: true })
    }
    
    webviewError = (reason: string) => {
        this.setState({ error: true, errorDescription: reason })
    }
    
    webviewReload = () => {
        if (this.webview) {
            this.setState({ loaded: false, error: false })
            this.webview.reload()
        } else if (this.state.loadFull) {
            this.loadFull()
        }
    }

    // ==================== TTS IMPLEMENTATION ====================

    stopTTS = () => {
        this.activeRequestId++
        
        if (this.audioPlayer) {
            this.audioPlayer.pause()
            this.audioPlayer.src = ''
            this.audioPlayer = null
        }
        
        if (this.currentBlobUrl) {
            URL.revokeObjectURL(this.currentBlobUrl)
            this.currentBlobUrl = null
        }
        
        if (this.state.isReading || this.state.isLoadingTTS) {
            this.setState({ 
                isReading: false, 
                isLoadingTTS: false,
                ttsDownloadProgress: 0
            })
        }
    }

    handleReadAloud = async () => {
        if (this.state.isReading || this.state.isLoadingTTS) {
            this.stopTTS()
            return
        }
        
        if (!this.webview) return
        
        const currentRequestId = ++this.activeRequestId
        
        try {
            const content = await this.webview.executeJavaScript(
                this.state.loadWebpage 
                    ? "document.body.innerText || ''" 
                    : "document.querySelector('article')?.innerText || document.body.innerText || ''"
            )
            
            if (!content || content.trim().length === 0) {
                window.utils.showMessageBox(
                    intl.get("app.name"),
                    "No text content found in article.",
                    intl.get("confirm"),
                    "",
                    false,
                    "info"
                )
                return
            }
            
            if (content.length > 10000) {
                window.utils.showMessageBox(
                    intl.get("app.name"),
                    `Article is too long for TTS (${content.length.toLocaleString()} characters, max 10,000).`,
                    intl.get("confirm"),
                    "",
                    false,
                    "warning"
                )
                return
            }
            
            this.setState({ isLoadingTTS: true, ttsDownloadProgress: 0 })
            
            // 1. Initialize Session
            if (!this.ttsSession) {
                // Reinforce global config just in case
                // @ts-ignore
                env.wasm.wasmPaths = WASM_REL_PATH;

                this.ttsSession = new TtsSession({
                    voiceId: 'en_US-lessac-medium',
                    wasmPaths: {
                        onnxWasm: WASM_REL_PATH,
                        piperWasm: `${WASM_REL_PATH}piper_phonemize.wasm`,
                        piperData: `${WASM_REL_PATH}piper_phonemize.data`,
                    },
                    progress: (progress) => {
                        if (currentRequestId === this.activeRequestId && progress.total > 0) {
                            const percent = (progress.loaded / progress.total) * 100
                            this.setState({ ttsDownloadProgress: percent })
                        }
                    }
                });
            }

            // 2. Predict
            const blob = await this.ttsSession.predict(content)
            
            if (currentRequestId !== this.activeRequestId) return
            
            if (this.currentBlobUrl) URL.revokeObjectURL(this.currentBlobUrl)
            
            const url = URL.createObjectURL(blob)
            this.currentBlobUrl = url
            
            const audio = new Audio(url)
            this.audioPlayer = audio
            
            audio.onended = () => {
                if (this.activeRequestId === currentRequestId) {
                    this.setState({ isReading: false })
                }
            }
            
            audio.onerror = (e) => {
                console.error("Audio Playback Error:", e)
                this.stopTTS()
            }
            
            await audio.play()
            this.setState({ 
                isReading: true, 
                isLoadingTTS: false,
                ttsDownloadProgress: 0
            })
            
        } catch (e) {
            console.error("TTS Generation Error:", e)
            if (currentRequestId === this.activeRequestId) {
                this.setState({ 
                    isLoadingTTS: false, 
                    isReading: false,
                    ttsDownloadProgress: 0
                })
                
                const errorMsg = e instanceof Error ? e.message : "Unknown error"
                window.utils.showMessageBox(
                    intl.get("app.name"),
                    `TTS Failed: ${errorMsg}`,
                    intl.get("confirm"),
                    "",
                    false,
                    "error"
                )
            }
        }
    }

    // ==================== LIFECYCLE METHODS ====================

    componentDidMount = () => {
        const webview = this.webviewRef.current
        if (webview && webview !== this.webview) {
            this.webview = webview
            webview.focus()
            this.setState({ loaded: false, error: false })
            webview.addEventListener("did-stop-loading", this.webviewLoaded)
            
            let card = document.querySelector(
                `#refocus div[data-iid="${this.props.item._id}"]`
            ) as HTMLElement
            if (card) {
                // @ts-ignore
                card.scrollIntoViewIfNeeded()
            }
        }
    }

    componentDidUpdate = (prevProps: ArticleProps) => {
        if (prevProps.item._id !== this.props.item._id) {
            this.stopTTS()
            
            this.setState({
                loadWebpage: this.props.source.openTarget === SourceOpenTarget.Webpage,
                loadFull: this.props.source.openTarget === SourceOpenTarget.FullContent,
            })
            
            if (this.props.source.openTarget === SourceOpenTarget.FullContent) {
                this.loadFull()
            }
        }
        this.componentDidMount()
    }

    componentWillUnmount = () => {
        this.stopTTS()
        if (this.webview) {
            this.webview.removeEventListener("did-stop-loading", this.webviewLoaded)
        }
        let refocus = document.querySelector(
            `#refocus div[data-iid="${this.props.item._id}"]`
        ) as HTMLElement
        if (refocus) refocus.focus()
    }

    toggleWebpage = () => {
        if (this.state.loadWebpage) {
            this.setState({ loadWebpage: false })
        } else if (
            this.props.item.link.startsWith("https://") ||
            this.props.item.link.startsWith("http://")
        ) {
            this.setState({ loadWebpage: true, loadFull: false })
        }
    }

    toggleFull = () => {
        if (this.state.loadFull) {
            this.setState({ loadFull: false })
        } else if (
            this.props.item.link.startsWith("https://") ||
            this.props.item.link.startsWith("http://")
        ) {
            this.setState({ loadFull: true, loadWebpage: false })
            this.loadFull()
        }
    }
    
    loadFull = async () => {
        this.setState({ fullContent: "", loaded: false, error: false })
        const link = this.props.item.link
        try {
            const result = await fetch(link)
            if (!result || !result.ok) throw new Error()
            const html = await decodeFetchResponse(result, true)
            if (link === this.props.item.link) {
                this.setState({ fullContent: html })
            }
        } catch {
            if (link === this.props.item.link) {
                this.setState({
                    loaded: true,
                    error: true,
                    errorDescription: "MERCURY_PARSER_FAILURE",
                })
            }
        }
    }

    articleView = () => {
        const a = encodeURIComponent(
            this.state.loadFull
                ? this.state.fullContent
                : this.props.item.content
        )
        const h = encodeURIComponent(
            renderToString(
                <>
                    <p className="title">{this.props.item.title}</p>
                    <p className="date">
                        {this.props.item.date.toLocaleString(
                            this.props.locale,
                            { hour12: !this.props.locale.startsWith("zh") }
                        )}
                    </p>
                    <article></article>
                </>
            )
        )
        return `article/article.html?a=${a}&h=${h}&f=${encodeURIComponent(
            this.state.fontFamily
        )}&s=${this.state.fontSize}&d=${this.props.source.textDir}&u=${
            this.props.item.link
        }&m=${this.state.loadFull ? 1 : 0}`
    }

    render = () => (
        <FocusZone className="article">
            <Stack horizontal style={{ height: 36 }}>
                <span style={{ width: 96 }}></span>
                <Stack
                    className="actions"
                    grow
                    horizontal
                    tokens={{ childrenGap: 12 }}>
                    <Stack.Item grow>
                        <span className="source-name">
                            {this.state.loaded ? (
                                this.props.source.iconurl && (
                                    <img
                                        className="favicon"
                                        src={this.props.source.iconurl}
                                    />
                                )
                            ) : (
                                <Spinner size={1} />
                            )}
                            {this.props.source.name}
                            {this.props.item.creator && (
                                <span className="creator">
                                    {this.props.item.creator}
                                </span>
                            )}
                        </span>
                    </Stack.Item>
                    <CommandBarButton
                        title={
                            this.props.item.hasRead
                                ? intl.get("article.markUnread")
                                : intl.get("article.markRead")
                        }
                        iconProps={
                            this.props.item.hasRead
                                ? { iconName: "StatusCircleRing" }
                                : {
                                      iconName: "RadioBtnOn",
                                      style: {
                                          fontSize: 14,
                                          textAlign: "center",
                                      },
                                  }
                        }
                        onClick={() =>
                            this.props.toggleHasRead(this.props.item)
                        }
                    />
                    <CommandBarButton
                        title={
                            this.props.item.starred
                                ? intl.get("article.unstar")
                                : intl.get("article.star")
                        }
                        iconProps={{
                            iconName: this.props.item.starred
                                ? "FavoriteStarFill"
                                : "FavoriteStar",
                        }}
                        onClick={() =>
                            this.props.toggleStarred(this.props.item)
                        }
                    />
                    <CommandBarButton
                        title={intl.get("article.loadFull")}
                        className={this.state.loadFull ? "active" : ""}
                        iconProps={{ iconName: "RawSource" }}
                        onClick={this.toggleFull}
                    />
                    <CommandBarButton
                        title={intl.get("article.loadWebpage")}
                        className={this.state.loadWebpage ? "active" : ""}
                        iconProps={{ iconName: "Globe" }}
                        onClick={this.toggleWebpage}
                    />
                    {/* ==================== TTS BUTTON ==================== */}
                    <CommandBarButton
                        title={this.state.isReading ? "Stop Reading" : "Read Aloud"}
                        className={this.state.isReading ? "active" : ""}
                        iconProps={{ 
                            iconName: this.state.isLoadingTTS ? "ProgressRingDots" : 
                                     this.state.isReading ? "StopSolid" : "Volume3" 
                        }}
                        onClick={this.handleReadAloud}
                        disabled={this.state.isLoadingTTS}
                    />
                    <CommandBarButton
                        title={intl.get("more")}
                        iconProps={{ iconName: "More" }}
                        menuIconProps={{ style: { display: "none" } }}
                        menuProps={this.moreMenuProps()}
                    />
                </Stack>
                <Stack horizontal horizontalAlign="end" style={{ width: 112 }}>
                    <CommandBarButton
                        title={intl.get("close")}
                        iconProps={{ iconName: "BackToWindow" }}
                        onClick={this.props.dismiss}
                    />
                </Stack>
            </Stack>
            
            {this.state.isLoadingTTS && this.state.ttsDownloadProgress > 0 && (
                <ProgressIndicator 
                    label="Downloading TTS model (first time only)..."
                    description={`${Math.round(this.state.ttsDownloadProgress)}%`}
                    percentComplete={this.state.ttsDownloadProgress / 100}
                />
            )}
            
            {(!this.state.loadFull || this.state.fullContent) && (
                <webview
                    ref={this.webviewRef}
                    id="article"
                    className={this.state.error ? "error" : ""}
                    key={
                        this.props.item._id +
                        (this.state.loadWebpage ? "_" : "") +
                        (this.state.loadFull ? "__" : "")
                    }
                    src={
                        this.state.loadWebpage
                            ? this.props.item.link
                            : this.articleView()
                    }
                    allowpopups={"true" as unknown as boolean}
                    webpreferences="contextIsolation,disableDialogs,autoplayPolicy=document-user-activation-required"
                    partition={this.state.loadWebpage ? "sandbox" : undefined}
                />
            )}
            {this.state.error && (
                <Stack
                    className="error-prompt"
                    verticalAlign="center"
                    horizontalAlign="center"
                    tokens={{ childrenGap: 12 }}>
                    <Icon iconName="HeartBroken" style={{ fontSize: 32 }} />
                    <Stack
                        horizontal
                        horizontalAlign="center"
                        tokens={{ childrenGap: 7 }}>
                        <small>{intl.get("article.error")}</small>
                        <small>
                            <Link onClick={this.webviewReload}>
                                {intl.get("article.reload")}
                            </Link>
                        </small>
                    </Stack>
                    <span style={{ fontSize: 11 }}>
                        {this.state.errorDescription}
                    </span>
                </Stack>
            )}
        </FocusZone>
    )
}

export default Article
