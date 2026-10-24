"""Windows CurrentUser DPAPI storage. No credentials in command arguments/logs."""
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path


def state_dir():
    base = os.environ.get('LOCALAPPDATA')
    if os.name != 'nt' or not base:
        raise RuntimeError('WINDOWS_DPAPI_REQUIRED')
    return Path(base) / 'CodexZjuStudentInfo'


class Blob(ctypes.Structure):
    _fields_ = [('cbData', wintypes.DWORD), ('pbData', ctypes.POINTER(ctypes.c_ubyte))]


def crypt(data, decrypt=False):
    if os.name != 'nt':
        raise RuntimeError('WINDOWS_DPAPI_REQUIRED')
    buffer = (ctypes.c_ubyte * len(data)).from_buffer_copy(data)
    source = Blob(len(data), buffer)
    target = Blob()
    crypt32 = ctypes.WinDLL('crypt32', use_last_error=True)
    kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
    # CRYPTPROTECT_UI_FORBIDDEN; omitting LOCAL_MACHINE binds to Windows user.
    if decrypt:
        fn = crypt32.CryptUnprotectData
        fn.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p,
                       ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
        args = [ctypes.byref(source), None, None, None, None, 1, ctypes.byref(target)]
    else:
        fn = crypt32.CryptProtectData
        fn.argtypes = [ctypes.POINTER(Blob), wintypes.LPCWSTR, ctypes.c_void_p,
                       ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
        args = [ctypes.byref(source), 'ZJU personal query', None, None, None, 1, ctypes.byref(target)]
    fn.restype = wintypes.BOOL
    if not fn(*args):
        raise RuntimeError('DPAPI_FAILED')
    kernel32.LocalFree.argtypes = [ctypes.c_void_p]
    kernel32.LocalFree.restype = ctypes.c_void_p
    try:
        return ctypes.string_at(target.pbData, target.cbData)
    finally:
        kernel32.LocalFree(target.pbData)


def save(name, value):
    path = state_dir() / name
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_bytes(crypt(json.dumps(value, ensure_ascii=False).encode('utf8')))
    temp.replace(path)


def load(name):
    path = state_dir() / name
    if not path.exists():
        return None
    return json.loads(crypt(path.read_bytes(), decrypt=True))


def credentials():
    value = load('credentials.dpapi')
    if not value or not value.get('username') or not value.get('password'):
        raise RuntimeError('CREDENTIALS_REQUIRED')
    return value


def credential_dialog():
    import tkinter as tk
    from tkinter import messagebox
    window = tk.Tk()
    window.title('浙大个人信息 · 本机凭据')
    window.geometry('460x250')
    tk.Label(window, text='在本机输入浙大统一身份认证账号。密码不会显示到聊天。', wraplength=420).pack(pady=12)
    tk.Label(window, text='学号 / 统一认证账号').pack()
    username = tk.Entry(window, width=42)
    username.pack()
    tk.Label(window, text='密码').pack()
    password = tk.Entry(window, width=42, show='●')
    password.pack()
    tk.Label(window, text='使用 Windows 当前用户加密保存；此步骤不连接学校。').pack(pady=10)
    def submit():
        u, p = username.get().strip(), password.get()
        if not u or not p:
            messagebox.showerror('尚未填写', '请输入账号和密码。')
            return
        try:
            save('credentials.dpapi', {'username': u, 'password': p})
        except Exception:
            messagebox.showerror('保存失败', 'Windows 加密存储不可用，未保存明文。')
            return
        password.delete(0, tk.END)
        window.destroy()
    tk.Button(window, text='加密保存', command=submit).pack()
    username.focus_set()
    window.mainloop()

