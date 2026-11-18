# 发布到插件市场

包已经做好，名字 `dsh-identity-gate`。剩下的是发布，分两步：npm 发布 → 提目录 PR。

## 为什么改名

原名 `dsh-lock` 在 npm 上**已经被别人占了**（作者 felixpu，0.1.4 版，功能也是密码门禁）。npm 不允许发同名包，所以换了 `dsh-identity-gate`。这个包名我查过，是空的。

## 第一步：npm 发布

需要 npm 账号（免费）。

1. 注册：<https://www.npmjs.com/signup>
2. 终端里登录：

```sh
npm login
```

3. 在包目录发布：

```sh
cd "C:\Users\16523\Documents\deepseek-harness\default-workspace\dsh-lock"
npm publish
```

4. 验证：<https://www.npmjs.com/package/dsh-identity-gate>

发布成功后，任何 DSH 用户都能用：

```sh
dsh plugin add dsh-identity-gate
```

## 第二步：上架插件市场

市场的插件列表来自 **awesome-dsh-plugin** 这个精选仓库（不是市场应用自己的仓库）。

1. Fork：<https://github.com/awesome-dsh-plugin/awesome-dsh-plugin>
2. 在它的插件列表里加一条，格式照抄现有条目（名称、链接、一句话描述、安装来源）
3. 提 PR

合并后，站点（awesome-dsh-plugin.com）和 DSH 内的插件市场会自动收录，通常一天内生效。

> 建议同时建一个 GitHub 仓库放源码（README 已写好），目录条目一般要填仓库链接。

## 本地安装包（备用）

已经打好 `dsh-identity-gate-0.1.0.tgz`（10 个文件，10.1 kB），放在包目录下。

别人拿到 tgz 也能直接装：

```sh
dsh plugin add ./dsh-identity-gate-0.1.0.tgz
```

## 以后更新

```sh
npm version patch
npm publish
```

市场会在下一次检查时提示更新。
