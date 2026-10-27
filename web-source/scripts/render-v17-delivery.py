"""Build the V17 delivery DOCX from finalized evidence and render immutable QA PNGs.

The root agent owns the once-only DOCX authoring marker. This script never runs
that marker. --build requires --marker-confirmed and finalized validation data.
No user-installed LibreOffice is selected. Aspose is a rendering-only fallback;
the final DOCX is authored by python-docx and is never saved by Aspose.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT.parent / "artifacts" / "v17-20261016"
VALIDATION = ARTIFACTS / "final-validation.json"
OUTPUT = ARTIFACTS / "SmartVio-V17-交付报告.docx"
QA = ARTIFACTS / "word-render"
TEMP = Path("E:/codex/Temp")
SKILL = Path("E:/codex/.codex/plugins/cache/openai-primary-runtime/documents/26.1013.11914/skills/documents")
ASPOSE_DEPS = ARTIFACTS / "docx-render-deps"
STATUS = {
    "passed": "通过", "pass": "通过", "fixed": "已修复", "verified": "已验证",
    "failed": "未通过", "fail": "未通过", "pending": "待测", "untested": "未测",
    "not-tested": "未测", "unreproduced": "未复现", "not-reproduced": "未复现",
    "blocked": "受阻", "completed": "完成", "complete": "完成", "partial": "部分覆盖",
    "not-applicable": "不适用", "not-verified": "未核实", "source-reviewed": "源码核对",
}


def read_json(path: Path, *, required: bool = True):
    if not path.is_file():
        if required:
            raise ValueError(f"缺少已确认的验证数据 拒绝生成报告 {path}")
        return {}
    return json.loads(path.read_text(encoding="utf-8-sig"))


def finalized_data():
    data = read_json(VALIDATION)
    if not isinstance(data, dict) or data.get("finalized") is not True:
        raise ValueError("final-validation.json 必须明确 finalized true 未确认的数据不能生成交付报告")
    if data.get("version") != "V17":
        raise ValueError("最终验证数据 version 必须为 V17")
    requirements = data.get("requirements")
    if not isinstance(requirements, list) or len(requirements) != 5:
        raise ValueError("请提供用户本轮五项要求 requirements 共五条 不推测用户原意")
    for item in requirements:
        if not isinstance(item, dict) or not item.get("title") or not item.get("status"):
            raise ValueError("每项要求必须有准确 title 与实际 status")
    tests = data.get("automatedTests")
    if not isinstance(tests, dict):
        raise ValueError("缺少 automatedTests")
    for key in ("passed", "failed", "skipped"):
        if type(tests.get(key)) is not int or tests[key] < 0:
            raise ValueError(f"automatedTests {key} 必须为真实非负整数")
    if not isinstance(data.get("fixes"), list) or not data["fixes"]:
        raise ValueError("缺少实际 fixes 不把待办事项写成已修复")
    if not isinstance(data.get("browserTests"), dict):
        raise ValueError("缺少 browserTests 需要区分浏览器与单元测试")
    if not isinstance(data.get("audioEvidence"), list):
        raise ValueError("缺少 audioEvidence 未获得的 RMS 可填 null 并标待测")
    delivery = data.get("delivery")
    if not isinstance(delivery, dict) or not delivery.get("url") or not delivery.get("sourceCommit"):
        raise ValueError("缺少实际交付 URL 或 sourceCommit")
    if not re.fullmatch(r"[0-9a-f]{7,40}", str(delivery["sourceCommit"]), re.I):
        raise ValueError("sourceCommit 不是已确认的 Git 提交号")
    if not isinstance(delivery.get("githubBackup"), dict) or not delivery["githubBackup"].get("status"):
        raise ValueError("请明确 GitHub 备份状态 不将 Sites 发布等同 GitHub 备份")
    return data


def value(item, *keys, default="未记录"):
    if not isinstance(item, dict):
        return str(item) if item not in (None, "") else default
    for key in keys:
        result = item.get(key)
        if result not in (None, "", []):
            if isinstance(result, list):
                return "；".join(value(part) for part in result)
            if isinstance(result, dict):
                return value(result, "summary", "result", "message", "status", default=default)
            return str(result)
    return default


def state(item):
    raw = value(item, "status", default="未测")
    return STATUS.get(raw.lower(), raw)


def clean_url(raw):
    """Do not print embedded credentials or auth-bearing query parameters."""
    parts = urlsplit(str(raw))
    if parts.scheme not in ("https", "http") or not parts.hostname:
        return "未提供可验证的访问链接"
    host = parts.hostname + (":" + str(parts.port) if parts.port else "")
    hidden = {"token", "access_token", "auth", "authorization", "key", "sig", "signature", "bypass"}
    query = urlencode([(k, v) for k, v in parse_qsl(parts.query) if k.lower() not in hidden])
    return urlunsplit((parts.scheme, host, parts.path, query, parts.fragment))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def runtime_env():
    result = os.environ.copy()
    result.update(TEMP=str(TEMP), TMP=str(TEMP), PYTHONDONTWRITEBYTECODE="1", PYTHONIOENCODING="utf-8")
    return result


def build(data):
    from docx import Document
    from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Cm, Pt, RGBColor

    diagnosis = read_json(ARTIFACTS / "learning-diagnosis.json")
    inventory = diagnosis.get("clientInventory", {})
    navigation, actions = inventory.get("navigation", []), inventory.get("actions", [])
    if len(navigation) != 14 or len(actions) != 79 or len(set(actions)) != 79:
        raise ValueError("基线客户端清单应为十四个功能页面与七十九个不同操作 请核查诊断数据")
    doc = Document()
    section = doc.sections[0]
    section.page_width, section.page_height = Cm(21), Cm(29.7)
    section.top_margin, section.bottom_margin = Cm(1.85), Cm(1.85)
    section.left_margin, section.right_margin = Cm(1.85), Cm(1.85)
    section.header_distance, section.footer_distance = Cm(.8), Cm(.8)
    for name in ("Normal", "Title", "Subtitle", "Heading 1", "Heading 2", "Heading 3", "Header", "Footer"):
        style = doc.styles[name]
        style.font.name, style.font.color.rgb, style.font.underline = "Microsoft YaHei", RGBColor(0, 0, 0), False
        style.font.italic = False
        rpr = style.element.get_or_add_rPr()
        fonts = rpr.find(qn("w:rFonts"))
        if fonts is None:
            fonts = OxmlElement("w:rFonts")
            rpr.insert(0, fonts)
        for attr in ("ascii", "hAnsi", "eastAsia", "cs"):
            fonts.set(qn("w:" + attr), "Microsoft YaHei")
        color = rpr.find(qn("w:color"))
        if color is not None:
            for attr in ("themeColor", "themeTint", "themeShade"):
                color.attrib.pop(qn("w:" + attr), None)
        ppr = style.element.find(qn("w:pPr"))
        if ppr is not None:
            for border in list(ppr.findall(qn("w:pBdr"))):
                ppr.remove(border)
    normal = doc.styles["Normal"]
    normal.font.size = Pt(10)
    normal.paragraph_format.line_spacing = 1.25
    normal.paragraph_format.space_after = Pt(7)
    # Default East Asian document grids otherwise expand a 9pt table line
    # to the template's 18pt grid and create nearly empty spillover pages.
    snap = OxmlElement("w:snapToGrid")
    snap.set(qn("w:val"), "false")
    normal.element.get_or_add_pPr().append(snap)
    doc.styles["Title"].font.size = Pt(26)
    doc.styles["Title"].paragraph_format.space_after = Pt(12)
    doc.styles["Subtitle"].font.size = Pt(11)
    doc.styles["Heading 1"].font.size = Pt(18)
    doc.styles["Heading 1"].paragraph_format.space_before = Pt(0)
    doc.styles["Heading 1"].paragraph_format.space_after = Pt(12)
    doc.styles["Heading 2"].font.size = Pt(12)
    doc.styles["Heading 2"].paragraph_format.space_before = Pt(12)
    doc.styles["Heading 2"].paragraph_format.space_after = Pt(7)

    def para(text, *, bold=False, size=None):
        p = doc.add_paragraph()
        p.paragraph_format.widow_control = True
        run = p.add_run(str(text))
        run.bold = bold
        if size:
            run.font.size = Pt(size)
        return p

    def heading(text, level=1):
        if re.search(r"[，。；：！？、\-:;!?]", text):
            raise ValueError("标题应使用无标点的准确描述 " + text)
        return doc.add_heading(text, level)

    def page(title):
        # A page break on the heading preserves pagination without adding an
        # empty paragraph. The rendering-only evaluation runtime is limited
        # to 200 paragraphs, including paragraphs inside table cells.
        p = heading(title)
        p.paragraph_format.page_break_before = True

    def table(headers, rows, widths, *, font=9, center_cols=()):
        t = doc.add_table(rows=1, cols=len(headers))
        t.alignment, t.autofit = WD_TABLE_ALIGNMENT.CENTER, False
        for i, width in enumerate(widths):
            t.columns[i].width = Cm(width)
        for i, text in enumerate(headers):
            t.rows[0].cells[i].text = str(text).rstrip("。")
        for row in rows:
            cells = t.add_row().cells
            for i, text in enumerate(row):
                cells[i].text = str(text).rstrip("。")
        for row_index, row in enumerate(t.rows):
            trpr = row._tr.get_or_add_trPr()
            no_split = OxmlElement("w:cantSplit")
            trpr.append(no_split)
            if row_index == 0:
                repeat = OxmlElement("w:tblHeader")
                repeat.set(qn("w:val"), "true")
                trpr.append(repeat)
            for col_index, cell in enumerate(row.cells):
                cell.width = Cm(widths[col_index])
                cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.TOP
                tcpr = cell._tc.get_or_add_tcPr()
                shade = OxmlElement("w:shd")
                shade.set(qn("w:fill"), "253B52" if row_index == 0 else "F2F5F8" if row_index % 2 == 0 else "FFFFFF")
                tcpr.append(shade)
                margins = OxmlElement("w:tcMar")
                for side, val in (("top", 70), ("bottom", 70), ("left", 90), ("right", 90)):
                    item = OxmlElement("w:" + side)
                    item.set(qn("w:w"), str(val))
                    item.set(qn("w:type"), "dxa")
                    margins.append(item)
                tcpr.append(margins)
                borders = OxmlElement("w:tcBorders")
                for side in ("top", "left", "bottom", "right", "insideH", "insideV"):
                    item = OxmlElement("w:" + side)
                    for key, val in (("val", "single"), ("sz", "5"), ("color", "D9D9D9")):
                        item.set(qn("w:" + key), val)
                    borders.append(item)
                tcpr.append(borders)
                for p in cell.paragraphs:
                    p.paragraph_format.space_before = Pt(0)
                    p.paragraph_format.space_after = Pt(0)
                    p.paragraph_format.line_spacing = 1.18
                    p.paragraph_format.keep_with_next = row_index == 0
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER if col_index in center_cols else WD_ALIGN_PARAGRAPH.LEFT
                    for run in p.runs:
                        run.font.size = Pt(font)
                        run.font.bold = row_index == 0
                        run.font.color.rgb = RGBColor(255, 255, 255) if row_index == 0 else RGBColor(0, 0, 0)
        return t

    def cards(items, *, headers, font=9):
        """Two compact columns; each entry remains one paragraph with breaks."""
        midpoint = (len(items) + 1) // 2
        rows = [[items[i], items[midpoint + i] if midpoint + i < len(items) else ""]
                for i in range(midpoint)]
        return table(headers, rows, [8.65, 8.65], font=font)

    props = doc.core_properties
    props.title, props.subject, props.author, props.last_modified_by = "SmartVio V17 交付报告", "功能修复与验收", "Codex", "Codex"
    props.keywords = "SmartVio V17 验证 学习路径 音频 社区"
    doc.add_paragraph("SmartVio V17 交付报告", "Title")
    doc.add_paragraph("功能修复 学习路径 声音验证", "Subtitle")
    para("交付日期 " + str(data.get("date", "2026-10-16")) + "    编制 Codex    交付对象 项目负责人", size=9)
    para(value(data, "summary", default="本轮交付状态与覆盖范围见下列五项要求和测试记录。"), bold=True)
    para("本报告说明实际修改、验证结果与后续验收范围。浏览器内部声音信号、界面操作、服务端联通和真实硬件测试分别记录，避免把一种检查当成另一种检查。")
    heading("本轮五项要求", 2)
    table(["用户要求与结果", "本轮交付"], [[value(r, "title") + "\n" + state(r), value(r, "result", "delivered", "request")] for r in data["requirements"]], [4.7, 12.6])
    tests, browser, delivery = data["automatedTests"], data["browserTests"], data["delivery"]
    para(f"自动测试 {tests['passed']} 项通过，{tests['failed']} 项未通过，{tests['skipped']} 项跳过。浏览器覆盖 {value(browser, 'summary', default='详见验收记录')}。真实手机、平板与电子小提琴的验收范围见第八节。", size=9)

    page("二 根因与修复")
    para("已修复与未复现分开记录。下面的状态取自本轮最终复核；对尚未复现的问题，保留复现条件和后续检查，而不写成已经消失。")
    table(["问题与状态", "已确认的根因和修复"], [[value(r, "issue", "title", "area") + "\n" + state(r), "根因  " + value(r, "rootCause", "cause") + "\n修复  " + value(r, "change", "result")] for r in data["fixes"]], [3.5, 13.8], font=9)
    heading("复现与证据边界", 2)
    for item in data.get("unreproduced", []):
        para(value(item, "issue", "name") + "。" + value(item, "result", "conditions", "boundary"), size=9)
    if not data.get("unreproduced"):
        para("未复现条目以本轮最终问题记录为准；没有复现证据的设备或系统问题，继续保留为待测。", size=9)

    page("三 六步学习与历史内容")
    para("新版学习路径围绕六个连续目标展开。暂停在原 SVG 节点上切换播放状态，保留当前帧；只有主动重播才重新开始。手机导航提前显示，避免看完长说明后才能找到下一步。")
    steps = [("一", "认识你的琴", "认识四根弦和应用入口"), ("二", "把一根弦调准", "参考音与麦克风授权分别由用户点击"), ("三", "跟上四拍", "演示四拍顺序并引导打开独立节拍器"), ("四", "练一个小乐句", "在真实练习页选择段落并主动播放"), ("五", "录下来再听一次", "真实录音需用户选择输入并授权"), ("六", "选择下一小步", "继续练习或到曲库选择下一首")]
    table(["六步目标", "操作边界"], [[a + "  " + b, c] for a, b, c in steps], [5.6, 11.7])
    heading("进度与保留内容", 2)
    para("六步采用独立的当前步骤和理解标记。下一步、动画播放、重播和前往实际功能均不自动授予理解、演奏水平或成绩；用户主动点击我看懂了后才记录，并可撤销。")
    para("原有九课和 guideV2 图文导览保留，旧进度不覆盖新六步记录。减少动态设置、后台暂停与退出后的监听清理分别验证。新版通用入口与旧导览的区分，以实际客户端验收结果为准。")
    para(value(data.get("learning", {}), "summary", "result", default="学习模块结构与状态测试已单独记录；实际访问入口和动画像素验证见本轮浏览器证据。"), size=9)
    para("新版组件标识 20261016-v17-learning。该标识用于核对实际加载资源，不代表用户已经完成学习。", size=9)

    page("四 声音信号与实际回放")
    para("正在播放只说明程序进入某个状态，不能证明有声音。本轮应同时检查用户点击后的音频上下文、输出增益、输出波形的均方根值 RMS，以及停止后的能量变化。RMS 为浏览器音频图中的线性幅值。")
    sound_rows = []
    for r in data["audioEvidence"]:
        rms = r.get("rms")
        rms_text = format(rms, ".6f") if isinstance(rms, (int, float)) else value(r, "rmsSummary", default="未取得")
        sound_rows.append(value(r, "name", "area", "voice") + "  " + state(r) + "\nRMS " + rms_text + "    " + value(r, "contextState", "outputState"))
    cards(sound_rows or ["声音信号  待测\nRMS 未取得\n不能凭状态字判定"], headers=["声音入口与实测一", "声音入口与实测二"], font=9)
    heading("不同用途保持独立", 2)
    para("小提琴单音采样用于旋律示范和 MIDI 预览，不宣称真人整曲演奏。调音参考音保持稳定；伴奏、合成弦乐与创作音色分别保留。真实麦克风录音保存输入音轨，不自动等同伴奏混音或低延迟琴端监听。")
    para("图内 RMS 大于零能证明浏览器内存在信号，不能代替扬声器、蓝牙耳机、USB 声卡和实际手机的听音测试。系统静音、选错输出设备和设备端延迟仍需真机验收。")
    para(value(data.get("audio", {}), "summary", "result", default="声音入口的启动时序、静音提示与清理结果，以本轮最终测试记录为准。"), size=9)

    page("五 客户端功能页面")
    para("以下十四个页面为客户端功能基线。功能存在、源码核对、单元测试和浏览器实际点击采用不同口径；没有逐项点击的页面不列为浏览器通过。")
    cases = browser.get("cases", [])
    page_summaries = {
        "home": "琴房入口 调音器 目标 最近练习", "library": "地区曲库 搜索 收藏 谱源", "practice": "看谱 示范 跟奏 段落 速度", "studio": "录音 视频 四轨 工程 回放下载", "performance": "伴奏导入 片段 变速 弦乐 音阶",
        "midi": "输入收录 音符编辑 标准文件", "tones": "创作音色 效果 本机和云预设", "tuner": "四弦参考 麦克风检测 A4", "metronome": "速度 拍号 独立节拍", "device": "真实连接状态 适配能力", "learn": "六步路径 原九课 旧导览", "community": "图文视频 投稿 互动 反馈", "shop": "产品信息与概念范围", "profile": "地区语言 模式 导出 清理",
    }
    def coverage(page_id):
        selected = [c for c in cases if isinstance(c, dict) and c.get("page") == page_id]
        return "；".join(value(c, "coverageType", "result", "status") for c in selected) if selected else "功能清单核对 未逐项点击"
    cards([n["zh"] + "\n功能  " + page_summaries.get(n["id"], "见实际页面") + "\n覆盖  " + coverage(n["id"]) for n in navigation], headers=["功能页面一", "功能页面二"], font=8.8)
    para("客户端管理入口 " + value(data.get("adminEntryHidden", {}), "result", "summary", "status", default="待最终界面证据核实") + "。后台地址与管理员权限分别保留；隐藏入口不能代替服务端鉴权。", size=9)

    page("六 七十九个操作基线")
    para("本表列出客户端动作标识，供研发逐项追踪。列入清单不代表本轮每个按钮都经浏览器点击；具体覆盖依赖下一节的测试类型与证据。模块生成的 MIDI 社区和伴奏控件另纳入功能验收。", size=9)
    chunks = [actions[i:i + 20] for i in range(0, len(actions), 20)]
    action_rows = [["\n".join(f"{column * 20 + index + 1}  {action}" for index, action in enumerate(chunk)) for column, chunk in enumerate(chunks)]]
    table(["操作 1 至 20", "操作 21 至 40", "操作 41 至 60", "操作 61 至 79"], action_rows, [4.325] * 4, font=8.1)
    para("清单基线提交 " + diagnosis["baselineCommit"] + "。交付提交见末页；若交付新增动作，新增部分应结合实际版本记录核对。", size=8.5)

    page("七 验收矩阵与前后台联通")
    para(f"自动测试命令 {value(tests, 'command', default='见测试日志')}。通过 {tests['passed']}，未通过 {tests['failed']}，跳过 {tests['skipped']}。这些数字不包含未实际执行的手机或电子琴用例。", size=9)
    matrix = data.get("acceptanceMatrix", [])
    if not matrix:
        matrix = [{"area": value(c, "area", "name", "page"), "coverageType": value(c, "coverageType", default="浏览器记录"), "result": value(c, "result", "summary", "status"), "status": c.get("status", "未记录")} for c in cases if isinstance(c, dict)]
    table(["验收范围与结论", "验证方法和实际结果"], [[value(r, "area", "name") + "\n" + state(r), value(r, "coverageType", "type") + "\n" + value(r, "result", "summary")] for r in matrix] or [["验收记录  待测", "未提供验证方法 不能推测通过"]], [4.1, 13.2], font=9)
    heading("客户端和后台", 2)
    para(value(data.get("adminClientLink", {}), "summary", "result", default="前后台联通的实际提交 审核 客户端回读证据尚未单独记录。"))
    para("主要证据 " + value(tests, "log", "evidence", default="final-validation.json 中列明的测试记录") + "；" + value(browser, "evidence", "log", default="浏览器逐项记录"), size=8.5)

    page("八 系统适配与待测范围")
    para("页面视口模拟只验证布局；Windows 上的 Chrome 验证不能转换成 iPhone 华为 iPad Mac 或其他品牌手机的实测通过。原生安装包、系统 API 与硬件连接能力还受各系统支持范围约束。")
    platforms = data.get("platforms", [])
    if not platforms:
        platforms = [{"name": n, "status": "未测", "boundary": "未记录本轮实体设备验证"} for n in ("Windows 浏览器", "iPhone 和 iPad", "Android 手机", "HarmonyOS 手机", "macOS 浏览器")]
    table(["环境与结论", "实际范围与边界"], [[value(r, "name", "platform") + "\n" + state(r), value(r, "boundary", "result", "coverage")] for r in platforms], [4.8, 12.5])
    heading("保留的实物验收任务", 2)
    para("真实电子小提琴需要逐型号核对音频输入、BLE MIDI 连接与恢复、音符时戳、参数持久保存和端到端监听延迟。真实手机还需覆盖麦克风 相机 系统音频路由 后台中断 热量和续航；没有测量数据时保留待测。")
    for limitation in data.get("limitations", []):
        para("• " + value(limitation, "summary", "result", "name"), size=9)

    page("九 备份与交付入口")
    para("实际应用入口 " + clean_url(delivery["url"]))
    para("交付源码提交 " + str(delivery["sourceCommit"]), size=9)
    para("源码位置 " + value(delivery, "repositoryPath", default=str(ROOT)), size=9)
    backup = delivery["githubBackup"]
    table(["备份项与状态", "核验内容"], [["GitHub 源码\n" + state(backup), value(backup, "result", "summary", "commit")], ["GitHub 地址\n按实际记录", clean_url(backup["url"]) if backup.get("url") else "未提供已确认的远程地址"], ["本地项目和报告\nE 盘", value(delivery, "localBackup", default="源码与交付记录保存在 E 盘项目及 artifacts 目录")], ["个人媒体与本机进度\n用户数据", "录音 项目 学习标记与离线资源具有独立保存范围 重要媒体仍需下载备份"]], [4.5, 12.8], font=9)
    heading("建议验收顺序", 2)
    para("先联网打开交付入口并确认 V17 资源，再进入六步学习测试暂停 重播与进度。随后用实际输出设备确认参考音 节拍器和示范回放，检查社区发布与后台回读，最后导出需要保留的个人媒体并验证离线入口。")
    para(value(delivery, "instructions", default="离线缓存更新只替换应用静态资源；如浏览器仍显示旧界面，应先核对当前版本与网络状态，避免直接清空全部网站数据导致录音丢失。"))
    para("最终验证记录 final-validation.json    功能与根因清单 learning-diagnosis.json    本报告可在 Word 中继续编辑。", size=8.5)

    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = footer.add_run("SmartVio V17    ")
    run.font.size = Pt(8)
    field = OxmlElement("w:fldSimple")
    field.set(qn("w:instr"), "PAGE")
    footer._p.append(field)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUTPUT)
    QA.mkdir(parents=True, exist_ok=True)
    source_hash = sha(VALIDATION)
    (QA / "authoring-manifest.json").write_text(json.dumps({"output": str(OUTPUT), "validationSha256": source_hash, "docxSha256": sha(OUTPUT), "plannedSections": 9, "inventoryPages": 14, "inventoryActions": 79, "author": "python-docx", "title": props.title, "authoringMarkerOwnedByRoot": True}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    audit_ooxml()
    return {"docx": str(OUTPUT), "sha256": sha(OUTPUT), "finalValidationSha256": source_hash}


def audit_ooxml():
    from lxml import etree
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    with zipfile.ZipFile(OUTPUT) as archive:
        xml = etree.fromstring(archive.read("word/document.xml"))
        titles = xml.xpath("//w:p[w:pPr/w:pStyle[@w:val='Title']]", namespaces=ns)
        if len(titles) != 1 or "".join(titles[0].xpath(".//w:t/text()", namespaces=ns)) != "SmartVio V17 交付报告":
            raise ValueError("Word Title 审查失败")
        if titles[0].xpath(".//w:pBdr|.//w:u[not(@w:val='none')]", namespaces=ns):
            raise ValueError("标题不得带边框或下划线")
        styles = etree.fromstring(archive.read("word/styles.xml"))
        color = styles.xpath("//w:style[@w:styleId='Title']/w:rPr/w:color/@w:val", namespaces=ns)
        if color != ["000000"]:
            raise ValueError("标题颜色必须为黑色")
        text = "".join(xml.xpath("//w:t/text()", namespaces=ns))
        if "turn0search" in text or "TODO" in text or "待填写" in text:
            raise ValueError("交付文本有未清理占位符")
        return {"titleStyle": True, "blackTitle": True, "tables": len(xml.xpath("//w:tbl", namespaces=ns)), "paragraphs": len(xml.xpath("//w:p", namespaces=ns))}


def aspose_worker():
    from xml.etree import ElementTree
    if not OUTPUT.is_file():
        raise ValueError("找不到需要渲染的真实 DOCX")
    if not ASPOSE_DEPS.is_dir():
        raise ValueError("任务内 Aspose 渲染依赖尚未安装")
    sys.path.insert(0, str(ASPOSE_DEPS))
    import aspose.words as aw
    target = QA / "aspose"
    target.mkdir(parents=True, exist_ok=True)
    before = sha(OUTPUT)
    document = aw.Document(str(OUTPUT))
    rendered_text = document.get_text()
    expected_tail = "本报告可在 Word 中继续编辑。"
    if ("九 备份与交付入口" not in rendered_text or expected_tail not in rendered_text
            or "This document was truncated" in rendered_text):
        raise ValueError("渲染载入未包含第九节与末句 或评估版已截断 不得以部分页面交付")
    with zipfile.ZipFile(OUTPUT) as archive:
        source_xml = ElementTree.fromstring(archive.read("word/document.xml"))
        source_runs = [node.text for node in source_xml.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t") if node.text]
    missing_runs = [part for part in source_runs if part not in rendered_text]
    if missing_runs:
        raise ValueError(f"渲染载入缺少 {len(missing_runs)} 个原始文本片段 不得交付部分报告")
    fonts = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
    if fonts.is_dir():
        font_settings = aw.fonts.FontSettings()
        font_settings.set_fonts_sources([aw.fonts.FolderFontSource(str(fonts), False)])
        document.font_settings = font_settings
    count = document.page_count
    if not 8 <= count <= 12:
        raise ValueError(f"报告实际为 {count} 页 请先检查分页与内容 范围应为八至十二页")
    settings = aw.saving.ImageSaveOptions(aw.SaveFormat.PNG)
    settings.horizontal_resolution = 144
    settings.vertical_resolution = 144
    pages = []
    for index in range(count):
        settings.page_set = aw.saving.PageSet(index)
        path = target / f"page-{index + 1}.png"
        document.save(str(path), settings)
        pages.append(str(path))
    # Only remove previous generated page images in this exact QA directory.
    # The final report is never rewritten or removed by a rendering pass.
    if not target.resolve().is_relative_to(QA.resolve()):
        raise ValueError("逐页图片位置超出 QA 目录")
    for old_page in target.glob("page-*.png"):
        if str(old_page) not in pages:
            old_page.unlink()
    if sha(OUTPUT) != before:
        raise ValueError("渲染修改了最终 DOCX 必须停止交付")
    result = {"renderer": "Aspose Words render only", "pageCount": count, "pages": pages, "docxUnchanged": True, "evaluationRenderer": True, "fullTextLoaded": True, "allSourceTextRunsPresent": True, "verifiedTextRuns": len(source_runs), "lastSectionPresent": True, "lastSentencePresent": True, "loadedCharacterCount": len(rendered_text), "note": "PNG may contain evaluation branding. No Aspose save is made to the final DOCX. Inspect every page and final-section presence before delivery."}
    (target / "render-result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))


def render():
    if not OUTPUT.is_file():
        raise ValueError("尚未生成真实 DOCX 不能渲染")
    QA.mkdir(parents=True, exist_ok=True)
    before, environment = sha(OUTPUT), runtime_env()
    dependencies = Path(sys.executable).resolve().parents[1]
    safe_paths = [dependencies / "bin" / "override", Path(sys.executable).parent]
    safe_paths.extend(path for path in (dependencies / "native").glob("**/bin") if path.is_dir())
    environment["PATH"] = os.pathsep.join(str(path) for path in safe_paths)
    command = [sys.executable, str(SKILL / "render_docx.py"), str(OUTPUT), "--output_dir", str(QA / "canonical"), "--emit_pdf", "--verbose"]
    canonical = subprocess.run(command, env=environment, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=240)
    (QA / "canonical-render.log").write_text("COMMAND " + repr(command) + "\nEXIT " + str(canonical.returncode) + "\nSTDOUT\n" + canonical.stdout + "\nSTDERR\n" + canonical.stderr, encoding="utf-8")
    pages = sorted((QA / "canonical").glob("page-*.png"))
    result = {"canonicalReturnCode": canonical.returncode, "canonicalPages": len(pages), "canonicalLog": str(QA / "canonical-render.log"), "usedUserLibreOffice": False}
    if not pages:
        fallback = subprocess.run([sys.executable, str(Path(__file__).resolve()), "--aspose-worker"], env=runtime_env(), capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300)
        (QA / "aspose-render.log").write_text("EXIT " + str(fallback.returncode) + "\nSTDOUT\n" + fallback.stdout + "\nSTDERR\n" + fallback.stderr, encoding="utf-8")
        if fallback.returncode:
            (QA / "render-diagnosis.json").write_text(json.dumps({**result, "asposeReturnCode": fallback.returncode, "rendered": False}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            raise ValueError("DOCX 渲染未完成 请检查 canonical-render.log 和 aspose-render.log 不交付未经逐页检查的报告")
        result.update(read_json(QA / "aspose" / "render-result.json"))
        pages = [Path(path) for path in result["pages"]]
    else:
        result.update(renderer="bundled canonical", pageCount=len(pages), pages=[str(page) for page in pages])
    if sha(OUTPUT) != before:
        raise ValueError("最终 DOCX 在渲染过程中发生变化")
    result.update(docxSha256=before, docxUnchanged=True, visualReviewCompleted=False)
    (QA / "render-result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build", action="store_true")
    parser.add_argument("--marker-confirmed", action="store_true", help="Only after root successfully ran the single authoring marker")
    parser.add_argument("--render", action="store_true")
    parser.add_argument("--check-input", action="store_true")
    parser.add_argument("--aspose-worker", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.aspose_worker:
        aspose_worker()
        return
    if not (args.build or args.render or args.check_input):
        parser.error("选择 --check-input --build 或 --render")
    if args.build and not args.marker_confirmed:
        parser.error("根代理尚未确认唯一一次 authoring marker 不得创建 DOCX")
    result = {}
    if args.check_input or args.build:
        data = finalized_data()
        result["input"] = {"finalized": True, "path": str(VALIDATION), "sha256": sha(VALIDATION)}
        if args.build:
            result["build"] = build(data)
    if args.render:
        result["render"] = render()
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
