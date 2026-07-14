import { Bot, Keyboard, Context, ImageAttachment, FileAttachment } from '@maxhub/max-bot-api';
import {
  PhotoAttachment,
  FileAttachment as ReceivedFileAttachment,
  AttachmentRequest,
} from '@maxhub/max-bot-api/types';
import { GreetUser } from '../../application/use-cases/GreetUser';
import { RegisterUser } from '../../application/use-cases/RegisterUser';
import { HandleStaffCommand } from '../../application/use-cases/HandleStaffCommand';
import { SuperuserAction, HandleSuperuserAction } from '../../application/use-cases/HandleSuperuserAction';
import { MenuAction, BrowseMenu } from '../../application/use-cases/BrowseMenu';
import { AddPage } from '../../application/use-cases/AddPage';
import { ManageContent } from '../../application/use-cases/ManageContent';
import { ManageStructure } from '../../application/use-cases/ManageStructure';
import { AddPageAttachment } from '../../application/use-cases/AddPageAttachment';
import { buildSuperuserView } from './superuserView';
import { buildMenuView, MenuView } from './menuView';
import { buildContentPanelView, buildDeleteConfirmView, attachmentLabel } from './contentManageView';
import { buildStructureView, buildStructureDeleteConfirmView } from './structureView';
import { buildPromptView, buildConfirmationView, StaffView } from './staffView';
import { PendingActionStore } from './PendingActionStore';

function parseSuperuserAction(type: string, targetIdRaw?: string): SuperuserAction {
  const targetId = Number(targetIdRaw);
  switch (type) {
    case 'employees':
      return { type: 'list_employees' };
    case 'user':
      return { type: 'view_user', targetId };
    case 'promote':
      return { type: 'promote', targetId };
    case 'demote':
      return { type: 'demote', targetId };
    default:
      return { type: 'open_panel' };
  }
}

function parseMenuAction(type: string, a?: string, b?: string): MenuAction {
  if (type === 'node') {
    return { type: 'node', nodeId: Number(a), batch: Number(b ?? '0') };
  }
  if (type === 'page') {
    return { type: 'page', nodeId: Number(a), pageIndex: Number(b ?? '0') };
  }
  return { type: 'root', batch: Number(a ?? '0') };
}

function toMessageExtra(view: { buttons?: MenuView['buttons'] }) {
  return {
    format: 'markdown' as const,
    attachments: view.buttons ? [Keyboard.inlineKeyboard(view.buttons)] : null,
  };
}

// Изображения показываются сразу вместе с текстом и кнопками. Документы MAX не даёт
// прикреплять к сообщению с клавиатурой ("Must be only one file attachment in message"),
// поэтому они отправляются отдельным сообщением только по нажатию своей кнопки — см. m:file:<id>.
async function sendMenuView(ctx: Context, view: MenuView, isCallback: boolean): Promise<void> {
  const images = (view.imageAttachments ?? []).map((a) => new ImageAttachment({ token: a.token }).toJson());
  const mainAttachments: AttachmentRequest[] = [...images];
  if (view.buttons) mainAttachments.push(Keyboard.inlineKeyboard(view.buttons));
  const mainExtra = {
    format: 'markdown' as const,
    attachments: mainAttachments.length > 0 ? mainAttachments : null,
  };

  if (isCallback) {
    await ctx.answerOnCallback({ message: { text: view.text, ...mainExtra } });
  } else {
    await ctx.reply(view.text, mainExtra);
  }
}

export class MaxBotServer {
  private readonly pendingActions = new PendingActionStore();

  constructor(
    private readonly bot: Bot,
    private readonly greetUser: GreetUser,
    private readonly registerUser: RegisterUser,
    private readonly handleStaffCommand: HandleStaffCommand,
    private readonly handleSuperuserAction: HandleSuperuserAction,
    private readonly browseMenu: BrowseMenu,
    private readonly addPage: AddPage,
    private readonly manageContent: ManageContent,
    private readonly manageStructure: ManageStructure,
    private readonly addPageAttachment: AddPageAttachment,
  ) {}

  registerHandlers(): void {
    this.bot.catch((err) => {
      console.error('Unhandled bot error:', err);
    });

    // Обычный запуск бота НЕ сохраняет id/имя посетителя — это просто просмотр сайта, ему не нужна
    // роль, и хранить его персональные данные незачем. В базу попадают только те, кто явно выполнил
    // /reg (см. ниже) — обычно это будущие сотрудники, которых потом ищет и назначает superuser.
    this.bot.on('bot_started', async (ctx) => {
      this.pendingActions.clear(ctx.update.user.user_id);
      await this.greetUser.execute(ctx.chatId, ctx.update.user.name);

      const result = await this.browseMenu.execute({ type: 'root', batch: 0 });
      const view = buildMenuView(result);
      if (view) {
        await sendMenuView(ctx, view, false);
      }
    });

    // /reg — сохраняет id/имя в базе, чтобы superuser мог найти пользователя через
    // /superuser <запрос> и выдать ему роль сотрудника. Без этой команды роль по умолчанию
    // всегда "user", так что для обычных посетителей она просто не нужна.
    this.bot.command('reg', async (ctx) => {
      const sender = ctx.message?.sender;
      if (!sender || !ctx.chatId) return;
      await this.registerUser.execute({
        id: sender.user_id,
        chatId: ctx.chatId,
        name: sender.name,
        username: sender.username,
      });
      await ctx.reply('✅ Вы зарегистрированы. Обратитесь к администратору, чтобы получить доступ к управлению контентом.');
    });

    // Переход в публичное меню всегда обрывает незавершённый ввод текста в /admin или /superuser —
    // иначе случайное сообщение при просмотре сайта могло бы попасть не туда (см. message_created ниже).
    this.bot.command('menu', async (ctx) => {
      const userId = ctx.message?.sender?.user_id;
      if (userId) this.pendingActions.clear(userId);
      const result = await this.browseMenu.execute({ type: 'root', batch: 0 });
      const view = buildMenuView(result);
      if (!view) return;
      await sendMenuView(ctx, view, false);
    });

    // "Обновить" — намеренно НЕ редактирует старое сообщение на месте (как обычная навигация ниже),
    // а шлёт новое внизу чата: если перед этим скачивали файл (он приходит отдельным сообщением),
    // старое меню осталось бы выше него, и до него пришлось бы прокручивать.
    this.bot.action(/^m:refresh$/, async (ctx) => {
      const actorId = ctx.callback?.user.user_id;
      if (actorId) this.pendingActions.clear(actorId);
      const result = await this.browseMenu.execute({ type: 'root', batch: 0 });
      const view = buildMenuView(result);
      // answerOnCallback обязательно должен содержать message или notification — пустой {} MAX API отклоняет.
      await ctx.answerOnCallback({ notification: 'Меню обновлено' });
      if (view) await sendMenuView(ctx, view, false);
    });

    this.bot.action(/^m:(root|node|page)(?::(\d+))?(?::(\d+))?$/, async (ctx) => {
      const actorId = ctx.callback?.user.user_id;
      if (actorId) this.pendingActions.clear(actorId);
      const [, type, a, b] = ctx.match ?? [];
      const action = parseMenuAction(type, a, b);
      const result = await this.browseMenu.execute(action);
      const view = buildMenuView(result);
      if (!view) {
        await ctx.answerOnCallback({ notification: 'Ничего не найдено.' });
        return;
      }
      await sendMenuView(ctx, view, true);
    });

    this.bot.action(/^m:file:(\d+)$/, async (ctx) => {
      const attachmentId = Number(ctx.match?.[1]);
      const result = await this.browseMenu.execute({ type: 'file', attachmentId });
      if (result.kind !== 'file') {
        await ctx.answerOnCallback({ notification: 'Файл не найден.' });
        return;
      }
      await ctx.answerOnCallback({ notification: 'Отправляю файл...' });
      await ctx.reply(result.attachment.filename ? `📄 ${result.attachment.filename}` : '', {
        format: 'markdown',
        attachments: [new FileAttachment({ token: result.attachment.token }).toJson()],
      });
    });

    // /admin — доступна и сотрудникам, и суперпользователю (он тоже сотрудник); структура уже готова
    this.bot.command('admin', async (ctx, next) => {
      const userId = ctx.message?.sender?.user_id ?? 0;
      const staff = await this.handleStaffCommand.execute(userId);
      if (staff.kind === 'unauthorized') {
        await next();
        return;
      }
      this.pendingActions.clear(userId);
      const result = await this.manageContent.execute({ type: 'view_root', batch: 0 });
      const view = buildContentPanelView(result);
      await ctx.reply(view.text, toMessageExtra(view));
    });

    this.bot.action(/^content:([a-z_]+)(?::(\d+))?(?::(\d+))?$/, async (ctx) => {
      const actorId = ctx.callback?.user.user_id ?? 0;
      const staff = await this.handleStaffCommand.execute(actorId);
      if (staff.kind === 'unauthorized') {
        await ctx.answerOnCallback({ notification: 'Недостаточно прав.' });
        return;
      }

      const [, type, aRaw, bRaw] = ctx.match ?? [];
      const id = Number(aRaw);
      const respond = (view: StaffView) =>
        ctx.answerOnCallback({ message: { text: view.text, ...toMessageExtra(view) } });

      // Любое действие здесь обрывает предыдущий незавершённый ввод (например, заголовок новой страницы) —
      // конкретные case ниже, которые начинают новый ввод, сразу же ставят свой pending заново.
      this.pendingActions.clear(actorId);

      switch (type) {
        case 'root':
        case 'cancel': {
          const result = await this.manageContent.execute({ type: 'view_root', batch: Number(aRaw ?? '0') });
          await respond(buildContentPanelView(result));
          return;
        }
        case 'node': {
          const result = await this.manageContent.execute({
            type: 'view_node',
            nodeId: id,
            batch: Number(bRaw ?? '0'),
          });
          await respond(buildContentPanelView(result));
          return;
        }
        case 'add_page': {
          this.pendingActions.set(actorId, { type: 'add_page_title', nodeId: id });
          await respond(
            buildPromptView('Шаг 1 из 2. Напишите заголовок страницы и отправьте сообщение.', 'content:cancel'),
          );
          return;
        }
        case 'page': {
          const result = await this.manageContent.execute({ type: 'view_page', pageId: id });
          await respond(buildContentPanelView(result));
          return;
        }
        case 'rename_page_title': {
          this.pendingActions.set(actorId, { type: 'edit_page_title', pageId: id });
          await respond(buildPromptView('Введите новый заголовок страницы:', 'content:cancel'));
          return;
        }
        case 'rename_page_desc': {
          this.pendingActions.set(actorId, { type: 'edit_page_description', pageId: id });
          await respond(buildPromptView('Введите новый текст страницы:', 'content:cancel'));
          return;
        }
        case 'attachments': {
          const result = await this.manageContent.execute({ type: 'list_attachments', pageId: id });
          await respond(buildContentPanelView(result));
          return;
        }
        case 'add_attachment': {
          this.pendingActions.set(actorId, { type: 'add_attachment', pageId: id });
          await respond(buildPromptView('Пришлите фото или документ следующим сообщением.', 'content:cancel'));
          return;
        }
        case 'confirm_delete_page': {
          const result = await this.manageContent.execute({ type: 'view_page', pageId: id });
          if (result.kind !== 'page_detail') {
            await respond(buildContentPanelView(result));
            return;
          }
          await respond(
            buildDeleteConfirmView(
              'страницу',
              result.page.title,
              'Текст этой страницы будет удалён без возможности восстановления.',
              `content:delete_page:${id}`,
              `content:page:${id}`,
            ),
          );
          return;
        }
        case 'delete_page': {
          const result = await this.manageContent.execute({ type: 'delete_page', pageId: id });
          await respond(buildContentPanelView(result));
          return;
        }
        case 'confirm_delete_attachment': {
          const result = await this.manageContent.execute({ type: 'view_attachment', attachmentId: id });
          if (result.kind !== 'attachment_detail') {
            await respond(buildContentPanelView(result));
            return;
          }
          await respond(
            buildDeleteConfirmView(
              'вложение',
              attachmentLabel(result.attachment),
              'Файл будет удалён со страницы без возможности восстановления.',
              `content:delete_attachment:${id}`,
              `content:attachments:${result.attachment.pageId}`,
            ),
          );
          return;
        }
        case 'delete_attachment': {
          const result = await this.manageContent.execute({ type: 'delete_attachment', attachmentId: id });
          await respond(buildContentPanelView(result));
          return;
        }
      }
    });

    // /superuser — только суперпользователь: управление ролями
    this.bot.command(/^superuser(?:\s+(.+))?$/, async (ctx, next) => {
      const userId = ctx.message?.sender?.user_id ?? 0;
      const query = ctx.match?.[1]?.trim();
      const action: SuperuserAction = query ? { type: 'search_users', query } : { type: 'open_panel' };
      const result = await this.handleSuperuserAction.execute(userId, action);

      if (result.kind === 'unauthorized') {
        await next();
        return;
      }
      this.pendingActions.clear(userId);
      const view = buildSuperuserView(result);
      if (!view) return;
      await ctx.reply(view.text, toMessageExtra(view));
    });

    this.bot.action(/^admin:(panel|employees|user|promote|demote)(?::(\d+))?$/, async (ctx) => {
      const actorId = ctx.callback?.user.user_id ?? 0;
      const [, type, targetIdRaw] = ctx.match ?? [];
      const action = parseSuperuserAction(type, targetIdRaw);
      const result = await this.handleSuperuserAction.execute(actorId, action);

      if (result.kind === 'unauthorized') {
        await ctx.answerOnCallback({ notification: 'Недостаточно прав.' });
        return;
      }
      this.pendingActions.clear(actorId);
      const view = buildSuperuserView(result);
      if (!view) {
        await ctx.answerOnCallback({ notification: 'Ничего не найдено.' });
        return;
      }
      await ctx.answerOnCallback({ message: { text: view.text, ...toMessageExtra(view) } });
    });

    // /superuser → 🗂 Структура разделов — создание/переименование/удаление разделов и подкаталогов
    this.bot.action(/^structure:([a-z_]+)(?::(\d+))?(?::(\d+))?$/, async (ctx) => {
      const actorId = ctx.callback?.user.user_id ?? 0;
      const gate = await this.handleSuperuserAction.execute(actorId, { type: 'open_panel' });
      if (gate.kind === 'unauthorized') {
        await ctx.answerOnCallback({ notification: 'Недостаточно прав.' });
        return;
      }

      const [, type, aRaw, bRaw] = ctx.match ?? [];
      const id = Number(aRaw);
      const respond = (view: StaffView) =>
        ctx.answerOnCallback({ message: { text: view.text, ...toMessageExtra(view) } });

      // Как и в content: — обрываем предыдущий незавершённый ввод; case ниже, начинающие новый ввод,
      // сразу же ставят свой pending заново.
      this.pendingActions.clear(actorId);

      switch (type) {
        case 'root':
        case 'cancel': {
          const result = await this.manageStructure.execute({ type: 'view_root', batch: Number(aRaw ?? '0') });
          await respond(buildStructureView(result));
          return;
        }
        case 'node': {
          const result = await this.manageStructure.execute({
            type: 'view_node',
            nodeId: id,
            batch: Number(bRaw ?? '0'),
          });
          await respond(buildStructureView(result));
          return;
        }
        case 'add_root': {
          this.pendingActions.set(actorId, { type: 'add_root_node' });
          await respond(buildPromptView('Напишите название нового раздела и отправьте сообщение.', 'structure:cancel'));
          return;
        }
        case 'add_sub': {
          this.pendingActions.set(actorId, { type: 'add_sub_node', parentId: id });
          await respond(
            buildPromptView('Напишите название нового подкаталога и отправьте сообщение.', 'structure:cancel'),
          );
          return;
        }
        case 'rename': {
          this.pendingActions.set(actorId, { type: 'rename_node', nodeId: id });
          await respond(buildPromptView('Введите новое название:', 'structure:cancel'));
          return;
        }
        case 'confirm_delete': {
          const result = await this.manageStructure.execute({ type: 'view_node', nodeId: id, batch: 0 });
          if (result.kind !== 'node_view') {
            await respond(buildStructureView(result));
            return;
          }
          await respond(
            buildStructureDeleteConfirmView(result.node.title, `structure:delete:${id}`, `structure:node:${id}`),
          );
          return;
        }
        case 'delete': {
          const result = await this.manageStructure.execute({ type: 'delete_node', nodeId: id });
          await respond(buildStructureView(result));
          return;
        }
      }
    });

    // Продолжение диалога добавления/редактирования (ввод текста)
    this.bot.on('message_created', async (ctx) => {
      const userId = ctx.message?.sender?.user_id;
      if (!userId) return;
      const pending = this.pendingActions.get(userId);
      if (!pending) return;

      if (pending.type === 'add_attachment') {
        const incoming = ctx.message?.body?.attachments?.find(
          (a): a is PhotoAttachment | ReceivedFileAttachment => a.type === 'image' || a.type === 'file',
        );
        if (!incoming) {
          const view = buildPromptView(
            'Не вижу файл. Пришлите фото или документ следующим сообщением.',
            'content:cancel',
          );
          await ctx.reply(view.text, toMessageExtra(view));
          return;
        }
        await this.addPageAttachment.execute(pending.pageId, {
          type: incoming.type,
          token: incoming.payload.token,
          filename: incoming.type === 'file' ? incoming.filename : null,
        });
        this.pendingActions.clear(userId);
        const result = await this.manageContent.execute({ type: 'list_attachments', pageId: pending.pageId });
        const view = buildContentPanelView(result);
        await ctx.reply(`✅ Файл добавлен.\n\n${view.text}`, toMessageExtra(view));
        return;
      }

      const text = ctx.message?.body?.text?.trim();
      if (!text) return;

      switch (pending.type) {
        case 'add_page_title': {
          this.pendingActions.set(userId, {
            type: 'add_page_description',
            nodeId: pending.nodeId,
            title: text,
          });
          const view = buildPromptView(
            'Шаг 2 из 2. Теперь напишите текст этой страницы — то, что увидят посетители.',
            'content:cancel',
          );
          await ctx.reply(view.text, toMessageExtra(view));
          return;
        }
        case 'add_page_description': {
          await this.addPage.execute(pending.nodeId, pending.title, text);
          this.pendingActions.clear(userId);
          const result = await this.manageContent.execute({ type: 'view_node', nodeId: pending.nodeId, batch: 0 });
          const view = buildConfirmationView(`✅ Страница «${pending.title}» добавлена.`, buildContentPanelView(result));
          await ctx.reply(view.text, toMessageExtra(view));
          return;
        }
        case 'edit_page_title': {
          const result = await this.manageContent.execute({
            type: 'rename_page_title',
            pageId: pending.pageId,
            title: text,
          });
          this.pendingActions.clear(userId);
          const view = buildConfirmationView('✅ Заголовок обновлён.', buildContentPanelView(result));
          await ctx.reply(view.text, toMessageExtra(view));
          return;
        }
        case 'edit_page_description': {
          const result = await this.manageContent.execute({
            type: 'update_page_description',
            pageId: pending.pageId,
            description: text,
          });
          this.pendingActions.clear(userId);
          const view = buildConfirmationView('✅ Текст обновлён.', buildContentPanelView(result));
          await ctx.reply(view.text, toMessageExtra(view));
          return;
        }
        case 'add_root_node': {
          const result = await this.manageStructure.execute({ type: 'add_root', title: text });
          this.pendingActions.clear(userId);
          const view = buildConfirmationView(`✅ Раздел «${text}» добавлен.`, buildStructureView(result));
          await ctx.reply(view.text, toMessageExtra(view));
          return;
        }
        case 'add_sub_node': {
          const result = await this.manageStructure.execute({
            type: 'add_sub',
            parentId: pending.parentId,
            title: text,
          });
          this.pendingActions.clear(userId);
          const view = buildConfirmationView(`✅ Подкаталог «${text}» добавлен.`, buildStructureView(result));
          await ctx.reply(view.text, toMessageExtra(view));
          return;
        }
        case 'rename_node': {
          const result = await this.manageStructure.execute({
            type: 'rename_node',
            nodeId: pending.nodeId,
            title: text,
          });
          this.pendingActions.clear(userId);
          const view = buildConfirmationView('✅ Название обновлено.', buildStructureView(result));
          await ctx.reply(view.text, toMessageExtra(view));
          return;
        }
      }
    });
  }

  start(): void {
    this.bot.start();
  }
}
