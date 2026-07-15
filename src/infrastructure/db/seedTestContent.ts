import 'dotenv/config';
import { createPool } from './pool';

// Разовый скрипт для сотрудников/администратора: создаёт тестовую структуру сайта "для вида" —
// четыре обязательных раздела и правильные подкаталоги специальностей (в формате "код - название",
// по данным https://tpgk70.gosuslugi.ru/abiturientam/). Текст страниц — заглушки, реальный контент
// сотрудники добавят сами через /admin. Каждый запуск ПОЛНОСТЬЮ пересоздаёт структуру разделов —
// см. предупреждение при запуске.

const pool = createPool();

const SPECIALTIES = [
  '21.02.03 - Сооружение и эксплуатация газонефтепроводов и газонефтехранилищ',
  '15.02.19 - Сварочное производство',
  '18.02.12 - Технология аналитического контроля химических соединений',
  '15.02.18 - Техническая эксплуатация и обслуживание роботизированного производства',
  '18.01.35 - Аппаратчик-оператор нефтехимического производства',
  '15.01.37 - Слесарь-наладчик контрольно-измерительных приборов и автоматики',
  '15.01.05 - Сварщик (ручной и частично механизированной сварки)',
  '13.01.10 - Электромонтёр по ремонту и обслуживанию электрооборудования',
  '15.01.31 - Мастер контрольно-измерительных приборов и автоматики',
  '43.01.09 - Повар, кондитер',
  '15.02.14 - Оснащение средствами автоматизации технологических процессов и производств',
];

const PLACEHOLDER_TEXT = 'Тестовая страница для проверки структуры сайта. Актуальный текст добавят сотрудники через /admin.';

async function insertNode(parentId: number | null, title: string, sortOrder: number): Promise<number> {
  const result = await pool.query<{ id: number }>(
    'INSERT INTO nodes (parent_id, title, sort_order) VALUES ($1, $2, $3) RETURNING id',
    [parentId, title, sortOrder],
  );
  return result.rows[0].id;
}

async function insertPage(nodeId: number, title: string, sortOrder: number): Promise<void> {
  await pool.query('INSERT INTO pages (node_id, title, description, sort_order) VALUES ($1, $2, $3, $4)', [
    nodeId,
    title,
    PLACEHOLDER_TEXT,
    sortOrder,
  ]);
}

async function seedSectionPages(nodeId: number, titles: string[]): Promise<void> {
  for (const [index, title] of titles.entries()) {
    await insertPage(nodeId, title, index);
  }
}

async function main(): Promise<void> {
  console.log('⚠️  Удаляю текущую структуру разделов (все nodes/pages/page_attachments)...');
  await pool.query('DELETE FROM nodes');

  console.log('Создаю "О колледже"...');
  const aboutId = await insertNode(null, 'О колледже', 0);
  await seedSectionPages(aboutId, ['Общие сведения', 'История', 'Достижения']);

  console.log('Создаю "Специальности" и подкаталоги специальностей...');
  const specialtiesId = await insertNode(null, 'Специальности', 1);
  for (const [index, title] of SPECIALTIES.entries()) {
    const specialtyId = await insertNode(specialtiesId, title, index);
    await insertPage(specialtyId, 'Описание', 0);
  }

  console.log('Создаю "Приёмная комиссия"...');
  const admissionsId = await insertNode(null, 'Приёмная комиссия', 2);
  await seedSectionPages(admissionsId, ['Контакты', 'Вступительные испытания', 'Как подать документы']);

  console.log('Создаю "Часто задаваемые вопросы"...');
  const faqId = await insertNode(null, 'Часто задаваемые вопросы', 3);
  await seedSectionPages(faqId, ['Нужно ли сдавать экзамены?', 'Как подать документы?', 'Есть ли общежитие?']);

  console.log('Готово: 4 раздела, 11 специальностей, тестовые страницы созданы.');
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Не удалось создать тестовую структуру:', err);
    return pool.end().finally(() => process.exit(1));
  });
