@echo off
chcp 65001 >nul
title 插件代码混淆工具（备份+输出到独立目录）
echo ================================================
echo   插件 JavaScript 文件批量混淆工具
echo   功能：备份原文件 + 生成混淆版本到独立目录
echo ================================================
echo.

:: 检查 javascript-obfuscator 是否可用
where javascript-obfuscator >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到 javascript-obfuscator。
    echo 请先执行: npm install -g javascript-obfuscator
    pause
    exit /b 1
)

:: 检查配置文件
if not exist "obfuscator-config.json" (
    echo [错误] 当前目录下缺少 obfuscator-config.json 配置文件。
    pause
    exit /b 1
)

:: 需要混淆的文件列表（可自定义）
set FILES=background.js popup.js

:: 创建备份目录（带时间戳）
set BACKUP_DIR=backup_%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set BACKUP_DIR=%BACKUP_DIR: =0%
mkdir "%BACKUP_DIR%" 2>nul
echo [信息] 原文件备份目录: %BACKUP_DIR%

:: 创建混淆输出目录
set OUTPUT_DIR=obfuscated_output
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"
echo [信息] 混淆后文件输出目录: %OUTPUT_DIR%
echo.

:: 遍历文件进行备份和混淆
for %%f in (%FILES%) do (
    if exist "%%f" (
        echo 正在处理: %%f
        :: 1. 备份原文件
        copy "%%f" "%BACKUP_DIR%\%%f" >nul
        echo   已备份到 %BACKUP_DIR%\%%f
        
        :: 2. 混淆并输出到独立目录（不覆盖原文件）
        javascript-obfuscator "%%f" --output "%OUTPUT_DIR%\%%f" --config "obfuscator-config.json"
        if %errorlevel% equ 0 (
            echo   ✅ 混淆成功: %OUTPUT_DIR%\%%f
        ) else (
            echo   ❌ 混淆失败: %%f
        )
    ) else (
        echo [跳过] %%f 不存在
    )
    echo.
)

echo ================================================
echo 操作完成！
echo - 原文件已备份到: %BACKUP_DIR%
echo - 混淆后的文件保存在: %OUTPUT_DIR%
echo.
echo 请手动将 %OUTPUT_DIR% 中的文件复制到扩展目录覆盖原文件（建议先测试混淆版是否正常）。
echo ================================================
pause