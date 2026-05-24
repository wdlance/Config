package com.doyo.erp.common.util;

import cn.hutool.core.io.FileUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.http.HttpUtil;
import com.doyo.erp.common.bean.FontInfoBean;
import com.doyo.erp.common.bean.FontNameRecordBean;
import com.google.typography.font.sfntly.Font;
import com.google.typography.font.sfntly.FontFactory;
import com.google.typography.font.sfntly.Tag;
import com.google.typography.font.sfntly.table.core.NameTable;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Entities;
import org.jsoup.parser.Parser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

/**
 * 字体处理工具类
 * @author  Robin
 * @since   2025/03/31
 */
public class FontUtil {
    private static final Logger logger = LoggerFactory.getLogger(FontUtil.class);

    /**
     * 生成新字体名称
     * @return          字体名称
     */
    public static String generateNewFontName(int min, int max) {
        // 使用线程安全的随机数生成器
        ThreadLocalRandom random = ThreadLocalRandom.current();
        // 生成随机长度：min - max位
        int length = random.nextInt(min, max + 1);
        // 创建字符数组存储结果
        char[] nameChars = new char[length];
        // 首字母大写处理（ASCII 65-90）
        nameChars[0] = (char) (random.nextInt(26) + 65);
        // 后续字母小写处理（ASCII 97-122）
        for (int i = 1; i < length; i++) {
            nameChars[i] = (char) (random.nextInt(26) + 97);
        }
        return new String(nameChars);
    }

    /**
     * 获取字体文件二进制数组
     * @param fontUrl   字体URL地址
     * @return          数据
     */
    public static byte[] getFontBytesByUrl(String fontUrl) {
        try {
            return MsHttpUtil.readRemoteFile(fontUrl, 5000, 100000);
        }
        catch (Exception e) {
            logger.error("获取字体文件失败", e);
            return null;
        }
    }

    /**
     * 获取字体文件二进制数组
     * @param fontPath  字体路径
     * @return          数据
     */
    public static byte[] getFontBytesByPath(String fontPath) {
        try {
            return FileUtil.readBytes(fontPath);
        }
        catch (Exception e) {
            logger.error("获取字体文件失败", e);
            return null;
        }
    }

    /**
     * 获取字体信息
     * @param bytes     字体数据
     * @return          字体信息
     */
    public static FontInfoBean getFontInfo(byte[] bytes) throws IOException {
        // 加载原始字体
        FontFactory fontFactory = FontFactory.getInstance();
        Font[] fonts = fontFactory.loadFonts(bytes);
        Font font = fonts[0];
        // 获取字体信息
        NameTable nameTable = font.getTable(Tag.name);
        List<NameTable.NameEntry> entries = new ArrayList<>();
        Iterator<NameTable.NameEntry> iterator = nameTable.iterator();
        while (iterator.hasNext()) {
            entries.add(iterator.next());
        }
        if (entries.isEmpty()) {
            return null;
        }
        FontInfoBean result = new FontInfoBean();
        List<FontNameRecordBean> nameRecordBeanList = new ArrayList<>();
        for (NameTable.NameEntry entry : entries) {
            int nameId = entry.nameId();
            FontNameRecordBean bean = new FontNameRecordBean();
            bean.setPlatformId(entry.platformId());
            bean.setPlatformEncodingId(entry.encodingId());
            bean.setLanguageId(entry.languageId());
            bean.setNameId(nameId);
            bean.setString(entry.name());
            if (StrUtil.isEmpty(result.getCopyright()) && nameId == NameTable.NameId.CopyrightNotice.value()) {
                result.setCopyright(entry.name());
            }
            if (StrUtil.isEmpty(result.getFontFamily()) && nameId == NameTable.NameId.FontFamilyName.value()) {
                result.setFontFamily(entry.name());
            }
            if (StrUtil.isEmpty(result.getFontSubFamily()) && nameId == NameTable.NameId.FontSubfamilyName.value()) {
                result.setFontSubFamily(entry.name());
            }
            if (StrUtil.isEmpty(result.getFullFontName()) && nameId == NameTable.NameId.FullFontName.value()) {
                result.setFullFontName(entry.name());
            }
            if (StrUtil.isEmpty(result.getVersion()) && nameId == NameTable.NameId.VersionString.value()) {
                result.setVersion(entry.name());
            }
            if (StrUtil.isEmpty(result.getPostScriptName()) && nameId == NameTable.NameId.PostscriptName.value()) {
                result.setPostScriptName(entry.name());
            }
            if (StrUtil.isEmpty(result.getDesigner()) && nameId == NameTable.NameId.Designer.value()) {
                result.setDesigner(entry.name());
            }

            nameRecordBeanList.add(bean);
        }
        result.setFontNameRecords(nameRecordBeanList);
        return result;
    }

    /**
     * 处理新字体
     * PS:: 需要安装ttx命令行工具，fontTools
     * @param fontUrl       字体文件路径
     * @param newFontName   新字体名称
     */
    public static String processFontInfo(String fontUrl, String newFontName) throws IOException {
        // 创建临时目录
        String tempDir = FileUtil.getTmpDirPath();
        if (!tempDir.endsWith("/")) {
            tempDir += "/";
        }
        tempDir += "font";
        logger.info("字体下载临时目录：{}", tempDir);
        if (!FileUtil.exist(tempDir)) {
            logger.info("字体下载临时目录不存在，将新建目录：{}", tempDir);
            FileUtil.mkdir(tempDir);
        }
        // 下载原始字体文件
        String sourceFontName = fontUrl.substring(fontUrl.lastIndexOf("/"));
        String sourceFontPath = tempDir + sourceFontName;
        long size = HttpUtil.downloadFile(fontUrl, FileUtil.file(sourceFontPath));
        logger.info("下载字体链接：{}，目标路径：{}，字体大小：{}", fontUrl, sourceFontPath, size);
        // 转换为TTX
        String ttxPath = sourceFontPath + ".ttx";
        List<String> commands = new ArrayList<>();
        commands.add("ttx");
        commands.add("-o");
        commands.add(ttxPath);
        commands.add(sourceFontPath);
        boolean success = CommandRunnerUtil.runCommand(commands.toArray(new String[0]));
        logger.info("处理结果：{}", success);
        FileUtil.del(sourceFontPath);
        if (!success) {
            FileUtil.del(ttxPath);
            return null;
        }
        Document doc = Jsoup.parse(FileUtil.readUtf8String(ttxPath), "", Parser.xmlParser());
        // 移除不需要的字体信息
        doc.select("namerecord[nameID=0]").remove();
        doc.select("namerecord[nameID=7]").remove();
        doc.select("namerecord[nameID=8]").remove();
        doc.select("namerecord[nameID=9]").remove();
        doc.select("namerecord[nameID=10]").remove();
        doc.select("namerecord[nameID=11]").remove();
        doc.select("namerecord[nameID=12]").remove();
        doc.select("namerecord[nameID=13]").remove();
        doc.select("namerecord[nameID=14]").remove();
        doc.select("namerecord[nameID=15]").remove();
        doc.select("namerecord[nameID=16]").remove();
        doc.select("namerecord[nameID=17]").remove();
        doc.select("namerecord[nameID=18]").remove();
        // 修改字体信息
        int num = doc.select("namerecord[nameID=1]").size();
        if (num > 0) {
            for (int i = 0; i < num; i++) {
                doc.select("namerecord[nameID=1]").get(i).text(newFontName);
            }
        }
        num = doc.select("namerecord[nameID=2]").size();
        if (num > 0) {
            for (int i = 0; i < num; i++) {
                doc.select("namerecord[nameID=2]").get(i).text("Regular");
            }
        }
        num = doc.select("namerecord[nameID=3]").size();
        if (num > 0) {
            for (int i = 0; i < num; i++) {
                doc.select("namerecord[nameID=3]").get(i).text(newFontName + ": 2025");
            }
        }
        num = doc.select("namerecord[nameID=4]").size();
        if (num > 0) {
            for (int i = 0; i < num; i++) {
                doc.select("namerecord[nameID=4]").get(i).text(newFontName);
            }
        }
        num = doc.select("namerecord[nameID=5]").size();
        if (num > 0) {
            for (int i = 0; i < num; i++) {
                doc.select("namerecord[nameID=5]").get(i).text("Version 1.000");
            }
        }
        num = doc.select("namerecord[nameID=6]").size();
        if (num > 0) {
            for (int i = 0; i < num; i++) {
                doc.select("namerecord[nameID=6]").get(i).text(newFontName);
            }
        }
        // 生成新的ttx文件
        String newTtxPath = ttxPath.replace(".ttx", "_new.ttx");
        doc.outputSettings().prettyPrint(true).escapeMode(Entities.EscapeMode.xhtml).charset("UTF-8").indentAmount(2);
        String newTtxStr = doc.toString();
        FileUtil.writeString(newTtxStr, newTtxPath, "UTF-8");
        try {
            // 转换为TTF
            String newFontPath = sourceFontPath.replace(".ttf", "_new.ttf");
            commands.clear();
            commands.add("ttx");
            commands.add("-o");
            commands.add(newFontPath);
            commands.add(newTtxPath);
            success = CommandRunnerUtil.runCommand(commands.toArray(new String[0]));
            FileUtil.del(ttxPath);
            FileUtil.del(newTtxPath);
            if (!success) {
                FileUtil.del(newFontPath);
                return null;
            }
            return newFontPath;
        }
        catch (Exception e) {
            logger.error("转换新字体失败", e);
            return null;
        }
    }
}
