# dsh-mcp-nestorclub

Плагин для DeepSeek Harness: подключает MCP-сервер `nestorclub-mcp`
(`https://mcp.nestorclub.com`), и инструменты сервера появляются у агента как
`mcp__web__*` — `list_sites`, `get_page`, `write_page`, `search_pages` и
остальные.

Ставится как обычный плагин: **Plugins → Add plugin → адрес → Install**. Правка
`cordis.patch.yml` для самого подключения больше не нужна — но ключ доступа
добавляется в профиль (см. ниже), в репозитории его нет.

## Что умеет

- одна строка `@deepseek-ai/dsh-mcp-client` с транспортом Streamable HTTP;
- сервер называется `web`, поэтому все его инструменты идут с префиксом
  `mcp__web__`;
- подключение поднимается при старте Harness и переподключается само, если
  сервер отвалился (это штатное поведение `dsh-mcp-client`);
- ключ доступа хранится в вашем профиле, а не в плагине.

## Что нужно

- DeepSeek Harness `0.2.2-rc.1` или новее;
- ключ `x-api-key` сервера nestorclub;
- сетевой доступ к `https://mcp.nestorclub.com`.

## Установка

1. **Plugins → Add plugin**.
2. Адрес репозитория:

   ```
   https://gitea.xn--txe.net/besi/dsh-mcp-nestorclub.git
   ```

   Суффикс `.git` обязателен — без него pnpm пытается скачать архив и падает.
3. **Install**, затем перезапустите приложение.

Если в профиле осталась вставленная руками строка `mcp-nestorclub` (старый
способ), удалите её: два клиента с одним `serverName: web` конфликтуют.

## Ключ доступа (обязательный шаг)

Плагин не содержит ключ. Добавьте override в `cordis.patch.yml` своего профиля:

- Windows: `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml`
- внутри WSL: `~/.dsh/profiles/desktop/cordis.patch.yml`

```yaml
- id: mcp-nestorclub
  config:
    serverName: web
    transport: streamable-http
    url: https://mcp.nestorclub.com
    headers:
      x-api-key: 'ВАШ_КЛЮЧ'
    failOnStartupError: true
```

Поля повторены потому, что override заменяет `config` строки целиком, а не
дополняет его. После правки файла Harness перечитывает профиль сам; если нет —
перезапустите.

Без ключа сервер отвечает `401`, строка плагина падает на старте, и инструментов
`mcp__web__*` не будет — это ожидаемое поведение, а не поломка Harness.

## Проверка

**В интерфейсе.** Plugins → в списке есть «MCP: nestorclub», переключатель
включён, ошибки у плагина нет.

**В чате.** В новом чате спросите что-нибудь вроде «покажи список разделов
сайта» — агент возьмёт `mcp__web__list_sites`. Или проверьте напрямую:

```
curl -sS https://mcp.nestorclub.com \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'x-api-key: ВАШ_КЛЮЧ' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2026-07-28","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

Ответ с `"serverInfo":{"name":"nestorclub-mcp"}` означает, что сервер и ключ в
порядке.

## Как это устроено

Плагин состоит только из манифеста и патча — ни Host-, ни Client-кода:

```
package.json        dsh.bundle.patch → cordis.patch.yml
cordis.patch.yml    insert одной строки @deepseek-ai/dsh-mcp-client
locale/{en,ru}.json название и описание для страницы Plugins
icon.svg            иконка
```

`insert` — тот же приём, которым DSH подключает собственные бандлы: строка
добавляется в композицию профиля, и штатный `dsh-mcp-client` поднимает
соединение. Поэтому плагин не зависит от версии ядра сильнее, чем сам
`dsh-mcp-client`.

## Обновление и удаление

- **Обновление:** Plugins → Remove, затем Add plugin заново (или Update, если
  появится версия в реестре).
- **Удаление:** Plugins → Remove; затем уберите override с ключом из
  `cordis.patch.yml`.

## Ограничения

- Нужен рабочий ключ: без него соединения нет, и это видно как ошибка строки.
- Ключ лежит в файле профиля открытым текстом. Это ваш файл, он не в git; если
  передаёте профиль другому человеку — ключ передаётся вместе с ним.
- Если сервер изменит ревизию протокола MCP и перестанет отдавать обязательные
  поля `tools/list`, `dsh-mcp-client` отклонит список инструментов. Лечится на
  стороне сервера, не плагина.
- Инструменты появляются в сессиях, созданных после перезапуска; уже открытый
  чат их не подхватит.

## Лицензия

MIT — см. [LICENSE](LICENSE).
