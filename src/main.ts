import 'dotenv/config';
import { Bot } from '@maxhub/max-bot-api';
import { createPool } from './infrastructure/db/pool';
import { PgUserRepository } from './infrastructure/db/PgUserRepository';
import { PgContentRepository } from './infrastructure/db/PgContentRepository';
import { MaxMessageSender } from './infrastructure/max/MaxMessageSender';
import { MaxBotServer } from './infrastructure/max/MaxBotServer';
import { GreetUser } from './application/use-cases/GreetUser';
import { RegisterUser } from './application/use-cases/RegisterUser';
import { HandleStaffCommand } from './application/use-cases/HandleStaffCommand';
import { HandleSuperuserAction } from './application/use-cases/HandleSuperuserAction';
import { BrowseMenu } from './application/use-cases/BrowseMenu';
import { AddPage } from './application/use-cases/AddPage';
import { ManageContent } from './application/use-cases/ManageContent';
import { ManageStructure } from './application/use-cases/ManageStructure';
import { AddPageAttachment } from './application/use-cases/AddPageAttachment';

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error('BOT_TOKEN is not set');
}

const pool = createPool();
const userRepository = new PgUserRepository(pool);
const contentRepository = new PgContentRepository(pool);

const bot = new Bot(token);
const messageSender = new MaxMessageSender(bot);

const greetUser = new GreetUser(messageSender);
const registerUser = new RegisterUser(userRepository);
const handleStaffCommand = new HandleStaffCommand(userRepository);
const handleSuperuserAction = new HandleSuperuserAction(userRepository);
const browseMenu = new BrowseMenu(contentRepository);
const addPage = new AddPage(contentRepository);
const manageContent = new ManageContent(contentRepository);
const manageStructure = new ManageStructure(contentRepository);
const addPageAttachment = new AddPageAttachment(contentRepository);

const server = new MaxBotServer(
  bot,
  greetUser,
  registerUser,
  handleStaffCommand,
  handleSuperuserAction,
  browseMenu,
  addPage,
  manageContent,
  manageStructure,
  addPageAttachment,
);
server.registerHandlers();
server.start();
