# Развёртывание на Linux

Инструкция «с нуля»: от чистой системы до бота, который работает постоянно (как systemd-сервис) и переживает перезагрузку. Команды рассчитаны на **Debian/Ubuntu** (`apt`); если у вас RHEL/CentOS/Fedora — используйте `dnf`/`yum` вместо `apt`, шаги те же.

Все команды выполняются от обычного пользователя с правами `sudo`. Если что-то пошло не так — раздел [«Устранение неполадок»](#устранение-неполадок) в конце.

## 1. Обновить систему и поставить Git

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl
```

## 2. Установить Node.js (LTS)

Версия Node.js в стандартных репозиториях Debian/Ubuntu часто устаревшая, поэтому ставим актуальную LTS через официальный репозиторий NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
```

Проверьте:

```bash
node -v
npm -v
```

## 3. Установить PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

Задайте пароль пользователю `postgres` (он понадобится в шаге 6):

```bash
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'ваш_пароль';"
```

По умолчанию Debian/Ubuntu уже разрешают подключение по паролю через TCP на `localhost` (используется дальше в `DATABASE_URL`) — отдельно ничего донастраивать не нужно. Если при выполнении `npm run migrate` в шаге 7 всё же получите ошибку аутентификации — см. [«Устранение неполадок»](#устранение-неполадок).

## 4. Скачать проект

```bash
sudo mkdir -p /opt/tpgk-max-bot
sudo chown $USER:$USER /opt/tpgk-max-bot
git clone https://github.com/enkilemma-wq/tpgk-max-bot.git /opt/tpgk-max-bot
cd /opt/tpgk-max-bot
npm install
```

## 5. Настроить `.env`

```bash
cp .env.example .env
nano .env
```

Впишите:

```
BOT_TOKEN=<токен вашего бота на платформе MAX>
DATABASE_URL=postgres://postgres:<пароль из шага 3>@localhost:5432/tpgk-db
```

Сохраните (`Ctrl+O`, `Enter`) и закройте (`Ctrl+X`). Саму базу `tpgk-db` создавать не нужно — следующий шаг сделает это сам.

## 6. Создать базу данных и наполнить структуру

```bash
npm run migrate
```

Если всё прошло без ошибок — увидите `Migration complete`. Подробности о том, что при этом происходит — в [`DB.md`](DB.md).

## 7. Проверить, что бот запускается

```bash
npm run dev
```

Откройте бота в MAX и напишите ему что угодно — должно прийти приветствие и главное меню. Если работает — остановите (`Ctrl+C`) и переходите дальше, к настройке постоянной работы.

**Первого администратора бота нужно назначить сейчас**, пока сервис ещё не запущен постоянно: попросите того, кто будет управлять контентом, написать боту `/reg` — он автоматически станет `superuser` (подробнее — [`DB.md`](DB.md#роли-и-назначение-первого-суперпользователя)).

## 8. Собрать production-версию

```bash
npm run build
```

## 9. Создать отдельного системного пользователя для сервиса

Чтобы бот работал не под вашим личным пользователем, а под отдельной учётной записью без прав входа в систему:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin tpgkbot
sudo chown -R tpgkbot:tpgkbot /opt/tpgk-max-bot
```

## 10. Запустить бота как systemd-сервис

Узнайте точный путь до `node`:

```bash
which node
```

Создайте файл сервиса:

```bash
sudo nano /etc/systemd/system/tpgk-max-bot.service
```

Вставьте (замените путь к `node` на тот, что вывела команда `which node`, если он отличается от `/usr/bin/node`):

```ini
[Unit]
Description=TPGK MAX Bot
After=network.target postgresql.service

[Service]
Type=simple
User=tpgkbot
WorkingDirectory=/opt/tpgk-max-bot
Environment=NODE_EXTRA_CA_CERTS=/opt/tpgk-max-bot/.certs/russian_trusted_ca_bundle.pem
ExecStart=/usr/bin/node dist/main.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Сохраните (`Ctrl+O`, `Enter`, `Ctrl+X`) и включите сервис:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tpgk-max-bot
sudo systemctl status tpgk-max-bot
```

Должно быть `active (running)`. Проверьте бота в MAX ещё раз — он должен отвечать так же, как в шаге 7. Теперь он запустится автоматически и после перезагрузки сервера.

## Полезные команды после установки

| Действие                     | Команда                                    |
| ------------------------------ | --------------------------------------------- |
| Остановить бота                | `sudo systemctl stop tpgk-max-bot`             |
| Запустить бота                 | `sudo systemctl start tpgk-max-bot`            |
| Перезапустить бота              | `sudo systemctl restart tpgk-max-bot`          |
| Посмотреть логи в реальном времени | `sudo journalctl -u tpgk-max-bot -f`        |
| Посмотреть последние 100 строк логов | `sudo journalctl -u tpgk-max-bot -n 100`  |

## Обновление бота до новой версии

```bash
cd /opt/tpgk-max-bot
sudo systemctl stop tpgk-max-bot
sudo -u tpgkbot git pull
sudo -u tpgkbot npm install
sudo -u tpgkbot npm run migrate
sudo -u tpgkbot npm run build
sudo systemctl start tpgk-max-bot
```

## Устранение неполадок

**`DATABASE_URL is not set`** — файл `.env` не создан или пустой. Повторите шаг 5.

**`password authentication failed for user "postgres"`** — пароль в `DATABASE_URL` не совпадает с тем, что задавали в шаге 3. Либо пароль неверный, либо `pg_hba.conf` требует другой метод аутентификации: проверьте файл (`sudo -u postgres psql -c "SHOW hba_file;"`), для строки `host all all 127.0.0.1/32` должно стоять `md5` или `scram-sha-256`, не `peer`/`ident`. После правки — `sudo systemctl reload postgresql`.

**`ECONNREFUSED`** — PostgreSQL не запущен: `sudo systemctl status postgresql`, при необходимости `sudo systemctl start postgresql`.

**Бот не отвечает в MAX, а в логах тихо** — проверьте `BOT_TOKEN` в `.env`: он должен быть тем самым токеном, который выдан именно этому боту на платформе MAX.

**Ошибка про сертификаты (TLS/CA)** — проверьте, что путь в `NODE_EXTRA_CA_CERTS` в файле сервиса указывает на реальный файл: `ls /opt/tpgk-max-bot/.certs/russian_trusted_ca_bundle.pem`.

**Сервис не стартует (`systemctl status` показывает `failed`)** — `sudo journalctl -u tpgk-max-bot -n 50` покажет точный текст ошибки Node.js.

**`Permission denied` при обращении к `/opt/tpgk-max-bot`** — папка или файл `.env` принадлежат не тому пользователю: `sudo chown -R tpgkbot:tpgkbot /opt/tpgk-max-bot`.
