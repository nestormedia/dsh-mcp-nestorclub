// dsh-mcp-nestorclub — Client half (hand-written web plugin bundle).
//
// The module table format mirrors the official decoration template: the
// factory returns the plugin definition (inject + apply), and apply registers
// into a client slot. The only module dependency is react, a platform seed.
//
// The card registers into the Plugins page slot plugins.bundle.config, keyed by
// this package name, so it appears on this plugin's own page: that is where the
// API key is asked for, checked, and saved.
window.__ModuleLoader__.load({
	id: "dsh-mcp-nestorclub",
	factory(require) {
		const React = require("react");

		function el(type, props) {
			const children = Array.prototype.slice.call(arguments, 2);
			return React.createElement.apply(React, [type, props].concat(children));
		}

		function errText(e) {
			if (e === null || e === undefined) return "неизвестная ошибка";
			if (typeof e === "object" && e.message !== undefined) return String(e.message);
			return String(e);
		}

		function api(path, body) {
			const init = body === undefined
				? { method: "GET" }
				: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
			return fetch("/mcp-nestorclub" + path, init).then((res) => {
				return res.text().then((text) => {
					let data = null;
					try { data = text === "" ? null : JSON.parse(text); } catch { data = null; }
					if (!res.ok) throw new Error(data !== null && data.error ? data.error : "HTTP " + res.status);
					if (data === null) throw new Error("MCP API вернул не-JSON: host-половина плагина не смонтирована");
					return data;
				});
			});
		}

		const S = {
			card: { border: "1px solid var(--color-border, #e5e5e5)", borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 },
			head: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
			title: { fontSize: 13, fontWeight: 600 },
			row: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
			input: { padding: "4px 8px", border: "1px solid var(--color-border, #ccc)", borderRadius: 6, fontSize: 12, background: "var(--color-bg, transparent)", color: "var(--color-text, inherit)", minWidth: 260 },
			btn: { padding: "4px 10px", border: "1px solid var(--color-border, #ccc)", borderRadius: 6, background: "transparent", fontSize: 12, cursor: "pointer", color: "var(--color-text, inherit)" },
			note: { fontSize: 12, color: "var(--color-text-secondary, #888)", lineHeight: 1.6 },
			error: { color: "#dc2626", fontSize: 12 },
			ok: { color: "#15803d", fontSize: 12 },
			badgeOn: { fontSize: 11, padding: "1px 7px", borderRadius: 10, border: "1px solid #16a34a", color: "#15803d" },
			badgeOff: { fontSize: 11, padding: "1px 7px", borderRadius: 10, border: "1px solid #dc2626", color: "#dc2626" },
		};

		function Card() {
			const [status, setStatus] = React.useState(null);
			const [key, setKey] = React.useState("");
			const [busy, setBusy] = React.useState(false);
			const [message, setMessage] = React.useState(null);
			const [failed, setFailed] = React.useState(false);

			function refresh() {
				setBusy(true);
				api("/status").then((value) => {
					setStatus(value);
					setMessage(null);
				}).catch((e) => {
					setStatus(null);
					setMessage(errText(e));
					setFailed(true);
				}).finally(() => setBusy(false));
			}

			function submit() {
				const value = key.trim();
				if (value === "") {
					setMessage("Сначала вставьте ключ.");
					setFailed(true);
					return;
				}
				setBusy(true);
				setMessage(null);
				api("/key", { key: value }).then(() => {
					setKey("");
					setMessage("Ключ сохранён, MCP-соединение перезагружено.");
					setFailed(false);
					return api("/status").then(setStatus);
				}).catch((e) => {
					setMessage(errText(e));
					setFailed(true);
				}).finally(() => setBusy(false));
			}

			function check() {
				setBusy(true);
				setMessage(null);
				api("/check", {}).then(() => {
					setMessage("Ключ рабочий: сервер ответил.");
					setFailed(false);
				}).catch((e) => {
					setMessage(errText(e));
					setFailed(true);
				}).finally(() => setBusy(false));
			}

			React.useEffect(() => { refresh(); }, []);

			const configured = status !== null && status.configured === true;
			const url = status !== null && status.url ? status.url : "https://mcp.nestorclub.com";

			return el("div", { style: S.card },
				el("div", { style: S.head },
					el("span", { style: S.title }, "MCP: nestorclub"),
					el("span", { style: S.note }, "инструменты mcp__web__*"),
					el("span", { style: { marginLeft: "auto" } },
						status === null ? null : configured
							? el("span", { style: S.badgeOn }, "ключ задан " + status.masked)
							: el("span", { style: S.badgeOff }, "ключ не задан"),
					),
				),
				el("div", { style: S.row },
					el("span", { style: S.note }, url),
					el("button", { style: S.btn, onClick: check, disabled: busy || !configured }, "Проверить ключ"),
					el("button", { style: S.btn, onClick: refresh, disabled: busy }, busy ? "..." : "Обновить"),
				),
				el("div", { style: S.row },
					el("input", {
						type: "password",
						style: S.input,
						placeholder: configured ? "Новый ключ x-api-key" : "Ключ x-api-key",
						value: key,
						onChange: (e) => setKey(e.target.value),
						onKeyDown: (e) => { if (e.key === "Enter") submit(); },
						disabled: busy,
					}),
					el("button", { style: S.btn, onClick: submit, disabled: busy }, configured ? "Заменить" : "Сохранить"),
				),
				message !== null ? el("div", { style: failed ? S.error : S.ok }, message) : null,
				el("div", { style: S.note }, "Ключ хранится в вашем профиле (cordis.patch.yml), не в репозитории. Его же можно задать командой /mcp-key в чате."),
			);
		}

		return {
			inject: ["slots"],
			apply(ctx) {
				ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
					name: "plugins.bundle.config",
					key: "dsh-mcp-nestorclub",
				}, () => el(Card)));
			},
		};
	},
});
