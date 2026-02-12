const RPCClient = require('@alicloud/pop-core')

module.exports = async function (req, res) {
  try {
    const client = new RPCClient({
      accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
      accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
      endpoint: 'https://nls-meta.cn-shanghai.aliyuncs.com',
      apiVersion: '2019-02-28'
    })

    const result = await client.request('CreateToken')
    // 前端 WebSocket 发起识别需要 token 和 appkey，一并返回
    const tokenId = result.Token && result.Token.Id ? result.Token.Id : result.TokenId
    const appkey = process.env.ALIYUN_APPKEY
    res.status(200).json({ token: tokenId, appkey: appkey || '', ...result })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
