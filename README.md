# TakhtJamshid Panel 𐎠

پنل مدیریت V2Ray / Xray با تم بنفش، دارک/لایت مود و انیمیشن — نوشته‌شده با Python + Flask و دیتابیس SQLite.

## اجرا

```bat
cd E:\TakhtJamshid
pip install -r requirements.txt
python app.py
```

یا فقط روی `install.bat` دابل‌کلیک کنید.
و یا اگر روی لینوکس هستیداز install.sh استفاده کنید.

سپس مرورگر را باز کنید: **http://127.0.0.1:2053**

ورود پیش‌فرض: `admin` / `admin`

## قابلیت‌ها

- **داشبورد**: آمار زنده inbound / client / outbound / node، آپلود و دانلود کل، کنترل هسته.
- **Inbounds**: ساخت inbound روی پورت دلخواه با پروتکل‌های VLESS, VMess, Trojan, Shadowsocks, WireGuard, Hysteria2, HTTP, SOCKS, Dokodemo, TUN.
  - ترنسپورت: TCP, mKCP, WebSocket, gRPC, HTTPUpgrade, XHTTP — امنیت: TLS, XTLS, REALITY.
- **کلاینت‌ها**: ساخت کلاینت با نام، حجم (GB)، تاریخ انقضا (روز)، محدودیت IP، وضعیت آنلاین.
  - دکمه «لینک» → نمایش لینک کانفیگ (`vless://`, `vmess://`, `trojan://`, `ss://`) + QR Code + لینک Subscription.
- **Outbounds**: ساخت outbound برای گرفتن ترافیک از یک IP/کانفیگ دیگر با پروتکل http/socks proxy یا زنجیره (chaining).
- **مسیریابی**: قوانین routing بر اساس دامنه / IP / پورت به مقصد outbound.
- **نودها**: مدیریت چند سرور از یک پنل.
- **هسته Xray**: ری‌استارت / توقف / شروع + پیش‌نمایش `config.json` تولیدشده.
- **لاگ‌ها** و **تنظیمات** (عنوان، زبان، Subscription، ربات تلگرام، حساب کاربری).
- **REST API**: تمام عملیات با پیشوند `/api/`.
- **تم بنفش** با دارک و لایت مود (دکمه 🌙/☀️ بالا)، انیمیشن و موشن.

## ساختار فایل‌ها

```
E:\TakhtJamshid
├── app.py             # اپلیکیشن Flask و همه روت‌های API
├── database.py        # لایه SQLite (بدون ORM)
├── xray_config.py     # ساخت لینک کانفیگ و config.json
├── requirements.txt
├── run.bat
├── takhtjamshid.db    # دیتابیس (خودکار ساخته می‌شود)
├── templates/
│   ├── login.html
│   └── dashboard.html
└── static/
    ├── css/style.css
    └── js/app.js
```

> برای ریست کامل، فایل `takhtjamshid.db` را پاک کنید.

## نکته

این یک پنل مدیریتی مستقل است؛ برای عملیاتی‌شدن واقعی باید هسته‌ی Xray روی سرور نصب باشد و
`config.json` تولیدشده‌ی پنل به آن اعمال شود. منطق ساخت لینک‌ها مطابق استاندارد URI کلاینت‌های V2Ray/Xray است.
