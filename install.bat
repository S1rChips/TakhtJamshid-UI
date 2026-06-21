@echo off
title TakhtJamshid Panel
cd /d %~dp0
echo Installing dependencies...
python -m pip install -r requirements.txt
echo.
echo Starting TakhtJamshid panel...
python app.py
pause
