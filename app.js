const express = require('express');
const path = require('path');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const pool = require('./db');
const session = require('express-session');

const app = express();
const port = 3000;

// Настройка EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Статика
app.use(express.static(path.join(__dirname, 'public')));

// Парсинг форм
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'твой-секретный-ключ-для-сессий', // можешь написать любую строку
    resave: false,
    saveUninitialized: false
}));

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// ============ МАРШРУТЫ СТРАНИЦ ============

app.get('/', (req, res) => {
    res.render('index');
});

app.get('/catalog', (req, res) => {
    res.render('catalog');
});

app.get('/contacts', (req, res) => {
    res.render('contacts');
});

// ============ РЕГИСТРАЦИЯ ============

app.get('/register', (req, res) => {
    res.render('register', { errors: [], old: {} });
});

app.post('/register', [
    body('name')
        .trim()
        .notEmpty().withMessage('Имя обязательно')
        .matches(/^[А-Яа-яЁё\s-]+$/).withMessage('Имя: только кириллица, пробел, тире'),

    body('surname')
        .trim()
        .notEmpty().withMessage('Фамилия обязательна')
        .matches(/^[А-Яа-яЁё\s-]+$/).withMessage('Фамилия: только кириллица, пробел, тире'),

    body('patronymic')
        .optional({ values: 'falsy' })
        .trim()
        .matches(/^[А-Яа-яЁё\s-]*$/).withMessage('Отчество: только кириллица, пробел, тире'),

    body('login')
        .trim()
        .notEmpty().withMessage('Логин обязателен')
        .matches(/^[A-Za-z0-9-]+$/).withMessage('Логин: только латиница, цифры, тире')
        .custom(async (value) => {
            const result = await pool.query('SELECT id FROM users WHERE login = $1', [value]);
            if (result.rows.length > 0) throw new Error('Этот логин уже занят');
            return true;
        }),

    body('email')
        .trim()
        .notEmpty().withMessage('Email обязателен')
        .isEmail().withMessage('Некорректный email')
        .custom(async (value) => {
            const result = await pool.query('SELECT id FROM users WHERE email = $1', [value]);
            if (result.rows.length > 0) throw new Error('Этот email уже зарегистрирован');
            return true;
        }),

    body('password')
        .notEmpty().withMessage('Пароль обязателен')
        .isLength({ min: 6 }).withMessage('Пароль: минимум 6 символов'),

    body('password_repeat')
        .notEmpty().withMessage('Повторите пароль')
        .custom((value, { req }) => {
            if (value !== req.body.password) throw new Error('Пароли не совпадают');
            return true;
        }),

    body('rules')
        .notEmpty().withMessage('Необходимо согласие с правилами')
], async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.render('register', { errors: errors.array(), old: req.body });
    }

    try {
        const hash = await bcrypt.hash(req.body.password, 10);

        await pool.query(
            `INSERT INTO users (first_name, last_name, middle_name, login, email, password_hash, role)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                req.body.name,
                req.body.surname,
                req.body.patronymic || null,
                req.body.login,
                req.body.email,
                hash,
                'customer'
            ]
        );

        res.redirect('/login');
    } catch (err) {
        console.error(err);
        res.render('register', {
            errors: [{ msg: 'Ошибка при сохранении. Попробуйте позже.' }],
            old: req.body
        });
    }
});

// ============ АВТОРИЗАЦИЯ ============

app.get('/login', (req, res) => {
    res.render('login', { errors: [], old: {} });
});

app.post('/login', [
    body('login').trim().notEmpty().withMessage('Введите логин'),
    body('password').notEmpty().withMessage('Введите пароль')
], async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.render('login', { errors: errors.array(), old: req.body });
    }

    try {
        const result = await pool.query('SELECT * FROM users WHERE login = $1', [req.body.login]);

        if (result.rows.length === 0) {
            return res.render('login', {
                errors: [{ msg: 'Неверный логин или пароль' }],
                old: req.body
            });
        }

        const user = result.rows[0];
        const match = await bcrypt.compare(req.body.password, user.password_hash);

        if (!match) {
            return res.render('login', {
                errors: [{ msg: 'Неверный логин или пароль' }],
                old: req.body
            });
        }

        req.session.user = {
            id: user.id,
            name: user.first_name,
            role: user.role
        };

        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.render('login', {
            errors: [{ msg: 'Ошибка сервера. Попробуйте позже.' }],
            old: req.body
        });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// ============ ЗАПУСК ============

pool.query('SELECT NOW()')
    .then(() => {
        console.log('Подключение к PostgreSQL успешно');
        app.listen(port, () => {
            console.log(`Сервер запущен: http://localhost:${port}`);
        });
    })
    .catch(err => {
        console.error('Ошибка подключения к БД:', err);
    });