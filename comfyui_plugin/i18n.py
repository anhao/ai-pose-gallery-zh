"""Request-local error prose only; node execution and schemas keep Chinese defaults."""

ERROR_TRANSLATIONS = {
    "未知图库类型: ": "Loại thư viện không xác định: ",
    "未找到数据文件: ": "Không tìm thấy tệp dữ liệu: ",
    "未知外部来源服装 ID": "ID trang phục từ nguồn ngoài không xác định",
    "服装没有该视角: ": "Trang phục không có góc nhìn này: ",
    "远程图片地址不允许重定向": "Không cho phép chuyển hướng URL ảnh từ xa",
    "远程图片不在已收录服装目录中": "Ảnh từ xa không có trong danh mục trang phục",
    "远程图片类型不符": "Loại ảnh từ xa không hợp lệ",
    "远程图片超过10MB": "Ảnh từ xa vượt quá 10 MB",
    "远程图片格式或尺寸不符": "Định dạng hoặc kích thước ảnh từ xa không hợp lệ",
    "非法图片路径": "Đường dẫn ảnh không hợp lệ",
    "图片文件不存在: ": "Tệp ảnh không tồn tại: ",
    "未知远程图片": "Ảnh từ xa không xác định",
}


def error_message(exc: Exception, accept_language: str = "") -> str:
    # Vietnamese is the only UI language; Accept-Language is ignored.
    # Never change process-wide locale.
    message = str(exc)
    for chinese, vietnamese in ERROR_TRANSLATIONS.items():
        if message == chinese or (chinese.endswith(": ") and message.startswith(chinese)):
            return vietnamese + message[len(chinese):]
    # OS/library exceptions have no stable translatable message contract.
    return "Không thể xử lý yêu cầu. " + message
