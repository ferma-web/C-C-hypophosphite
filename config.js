// Подключение к базе Supabase (проект ltagfebavqqjjggwinzq).
// anon-ключ публичный по задумке Supabase: доступ регулируется политиками RLS
// (см. supabase/schema.sql) — читать и править карточки может любой, у кого есть ссылка на сайт.
// Этот же файл читает GitHub Action, который архивирует данные в data/*.json.
window.SUPABASE_URL = 'https://ltagfebavqqjjggwinzq.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0YWdmZWJhdnFxampnZ3dpbnpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3MzUxMzcsImV4cCI6MjEwNjMxMTEzN30.cfqbg28zymUcbJbyTosFqjMS5CGUgRV9CKcZQPFnDJ0';
