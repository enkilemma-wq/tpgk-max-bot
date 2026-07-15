# Развёртывание на Windows 10 / Windows Server

Инструкция «с нуля»: от чистой системы до бота, который работает постоянно и переживает перезагрузку. Все команды — в PowerShell, запущенном **от имени администратора** (правый клик по значку PowerShell → «Запуск от имени администратора»).

Проверено на Windows 10 и Windows Server 2022. Если что-то пошло не так — раздел [«Устранение неполадок»](#устранение-неполадок) в конце.

## 1. Установить Node.js, Git и PostgreSQL

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
winget install PostgreSQL.PostgreSQL.18
```

Установщик PostgreSQL откроет графическое окно — там нужно один раз задать **пароль для пользователя `postgres`**. Запишите его, он понадобится в шаге 4.

Закройте и заново откройте PowerShell (от имени администратора), чтобы `node`, `git` и `psql` подхватились в PATH. Проверьте:

```powershell
node -v
git --version
```

Оба должны вывести версию, а не ошибку «команда не найдена».

## 2. Скачать проект

```powershell
cd C:\
git clone https://github.com/enkilemma-wq/tpgk-max-bot.git
cd tpgk-max-bot
npm install
```

## 3. Настроить `.env`

```powershell
Copy-Item .env.example .env
notepad .env
```

В блокноте впишите:

```
BOT_TOKEN=<токен вашего бота на платформе MAX>
DATABASE_URL=postgres://postgres:<пароль из шага 1>@localhost:5432/tpgk-db
```

Сохраните и закройте блокнот. Саму базу `tpgk-db` создавать не нужно — это сделает следующий шаг автоматически.

## 4. Создать базу данных и наполнить структуру

```powershell
npm run migrate
```

Если всё прошло без ошибок — увидите `Migration complete`. Подробности о том, что при этом происходит — в [`DB.md`](DB.md).

## 5. Проверить, что бот запускается

```powershell
npm run dev
```

Откройте бота в MAX и напишите ему что угодно — должно прийти приветствие и главное меню. Если работает — остановите (`Ctrl+C` в PowerShell) и переходите дальше, к настройке постоянной работы.

**Первого администратора бота нужно назначить сейчас**, пока сервис ещё не запущен постоянно: попросите того, кто будет управлять контентом, написать боту `/reg` — он автоматически станет `superuser` (подробнее — [`DB.md`](DB.md#роли-и-назначение-первого-суперпользователя)).

## 6. Собрать production-версию

```powershell
npm run build
```

## 7. Запустить бота как службу Windows (NSSM)

Чтобы бот работал постоянно и сам перезапускался при сбое или перезагрузке сервера, оборачиваем его в службу Windows через [NSSM](https://nssm.cc/).

```powershell
winget install NSSM.NSSM
```

Если winget не находит пакет — скачайте NSSM с официального сайта nssm.cc и положите `nssm.exe` в папку, добавленную в PATH (например, `C:\Windows`).

Создайте службу:

```powershell
nssm install TpgkMaxBot "C:\Program Files\nodejs\node.exe" "dist\main.js"
nssm set TpgkMaxBot AppDirectory "C:\tpgk-max-bot"
nssm set TpgkMaxBot AppEnvironmentExtra "NODE_EXTRA_CA_CERTS=.certs\russian_trusted_ca_bundle.pem"
nssm set TpgkMaxBot Start SERVICE_AUTO_START
```

Если `Get-Command node` показывает путь, отличный от `C:\Program Files\nodejs\node.exe` — используйте его вместо указанного выше.

Настройте логи (чтобы было куда смотреть при проблемах):

```powershell
mkdir C:\tpgk-max-bot\logs
nssm set TpgkMaxBot AppStdout "C:\tpgk-max-bot\logs\bot.log"
nssm set TpgkMaxBot AppStderr "C:\tpgk-max-bot\logs\bot-error.log"
```

Запустите службу:

```powershell
nssm start TpgkMaxBot
nssm status TpgkMaxBot
```

Должно быть `SERVICE_RUNNING`. Проверьте бота в MAX ещё раз — он должен отвечать так же, как в шаге 5. Теперь он запустится автоматически и после перезагрузки сервера.

## Полезные команды после установки

| Действие                          | Команда                              |
| ----------------------------------- | -------------------------------------- |
| Остановить бота                     | `nssm stop TpgkMaxBot`                 |
| Запустить бота                      | `nssm start TpgkMaxBot`                |
| Перезапустить бота                  | `nssm restart TpgkMaxBot`              |
| Посмотреть последние логи           | `Get-Content C:\tpgk-max-bot\logs\bot.log -Tail 50` |
| Удалить службу совсем               | `nssm remove TpgkMaxBot confirm`       |

## Обновление бота до новой версии

```powershell
cd C:\tpgk-max-bot
nssm stop TpgkMaxBot
git pull
npm install
npm run migrate
npm run build
nssm start TpgkMaxBot
```

## Устранение неполадок

**`DATABASE_URL is not set`** — файл `.env` не создан или пустой. Повторите шаг 3.

**Ошибка подключения к базе (`ECONNREFUSED` / `password authentication failed`)** — проверьте, что служба PostgreSQL запущена (`Get-Service postgresql*`) и что пароль в `DATABASE_URL` совпадает с тем, что задавали при установке PostgreSQL.

**Бот не отвечает в MAX, а в логах тихо** — проверьте `BOT_TOKEN` в `.env`: он должен быть тем самым токеном, который выдан именно этому боту на платформе MAX.

**Ошибка про сертификаты (TLS/CA)** — убедитесь, что `AppDirectory` службы указывает ровно на `C:\tpgk-max-bot` (папку с `.certs\`), а не на какую-то другую директорию — путь к сертификату в `NODE_EXTRA_CA_CERTS` относительный.

**Служба не стартует вообще (`SERVICE_STOPPED` сразу после `nssm start`)** — посмотрите `C:\tpgk-max-bot\logs\bot-error.log`, там будет точный текст ошибки Node.js.
