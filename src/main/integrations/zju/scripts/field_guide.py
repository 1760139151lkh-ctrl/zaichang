"""Contextual field dictionary; unknown fields stay explicit rather than guessed."""
COMMON={
 'id':('记录标识','identifier'),'name':('名称','business'),'title':('标题','business'),
 'total':('服务端声明的总记录数','pagination'),'totalResult':('服务端声明的总记录数','pagination'),
 'current_page':('当前页码','pagination'),'per_page':('每页条数','pagination'),'last_page':('最后页码','pagination'),
 'page':('页码','pagination'),'pageSize':('每页条数','pagination'),'size':('每页条数','pagination'),
 'current':('当前页码','pagination'),'code':('接口业务状态码，按系统解释','protocol'),
 'success':('接口业务是否成功','protocol'),'msg':('服务端消息','protocol'),'message':('服务端消息','protocol'),
 'data':('响应或业务对象容器，含义依所属接口','container'),'result':('响应数据容器','container'),
 'queryModel':('分页/排序框架元信息，不是学生业务资料','framework'),
 'userModel':('接口框架附带的用户模型，不作为正式权限或个人信息来源','framework'),
 'listnav':('接口框架导航信息，不参与业务计算','framework'),
 'localeKey':('接口语言/本地化元信息','framework'),
 'pageable':('接口框架分页标记','framework'),'rangeable':('接口框架范围标记，具体语义未核实','framework'),
 'completeAnswer':('接口框架标记，业务语义未核实','framework'),
 'jgpxzd':('接口排序相关辅助字段，具体语义未核实','framework'),'row_id':('查询结果行标识','framework'),
}
ZDBK={
 'xkkh':'选课课号；可能包含学年学期、课程代码、教学班等，原样保留',
 'kcmc':'课程名称','xf':'课程学分','cj':'原始成绩，可为数字、等级或状态文字','jd':'教务系统返回的五分制绩点',
 'kcb':'HTML 课程块：课程名、周次描述、教师、地点和可能的考试文字',
 'djj':'本条上课安排的起始节次','skcd':'本条安排的连续节数','xqj':'星期：1=周一，7=周日',
 'dsz':'单双周标记：0=单周，1=双周，2=单双周；依据 Celechron 解析',
 'xxq':'秋/冬/春/夏等短学期描述','sfqd':'是否确认，1 表示确认','jszgh':'教师工号/标识',
 'kssj':'期末考试原始日期时间文字','qzkssj':'期中考试原始日期时间文字',
 'jsmc':'期末考试教室','qzjsmc':'期中考试教室','zwxh':'期末考试座位号','qzzwxh':'期中考试座位号',
 'xm':'学生姓名（考试数据上下文）','cxbj':'源系统标记，是否为重修标志尚需核对；不凭此改成绩',
 'rsdzjs':'源课表辅助字段，确切语义未核实；不参与时间地点计算',
}
PRACTICE={
 'xm':'项目对象；此接口中不是学生姓名','xm.mc':'项目名称','xm.xmfl':'第二/三/四课堂分类',
 'xm.xmfl.id':'课堂分类编号：1/2/3 对应第二/第三/第四课堂','xm.xmfl.mc':'课堂分类名称',
 'xm.xmlb':'项目类型','xm.xmlx':'素质类型','xm.zxfs':'项目分值范围下限，不是本人获得记点',
 'xm.zdfs':'项目分值范围上限，不是本人获得记点','jd':'本人实际获得的实践记点，与教务 jd 绩点不同',
 'cyrshzt':'参与记录审核状态','cyrshzt.value':'审核状态码，5 为审核通过','cyrshzt.label':'审核状态文字',
 'sfsc':'是否已删除','hdjjygrcdgz':'活动简介及本人承担工作/角色','qksm':'情况说明/备注',
 'hdsj':'本人活动开始时间','hdjssj':'本人活动结束时间','gxsj':'更新时间','czsj':'源操作时间',
 'dektJf':'第二课堂正式记点','dsktJf':'第三课堂正式记点','dsiktJf':'第四课堂正式记点',
 'dektXf':'第二课堂学分','dsktXf':'第三课堂学分','dsiktXf':'第四课堂学分',
 'dektDj':'第二课堂等级','dsktDj':'第三课堂等级','dsiktDj':'第四课堂等级',
 'dektTg':'第二课堂通过状态','dsktTg':'第三课堂通过状态','dsiktTg':'第四课堂通过状态',
 'myTg':'美育通过状态（沿用仓库 myPassed）','lyTg':'劳育通过状态（沿用仓库 lyPassed）',
 'xh':'本人学号','departmentName':'院系名称',
}
OTHER={
 'start_time':'开始时间原始值','end_time':'结束/截止时间原始值','course_id':'所属课程 ID',
 'course_name':'所属课程名称','activity_id':'课程活动 ID','activity_type':'活动类型',
 'completeness':'本人完成状态/进度原始值','score':'得分原始值，满分和单位依活动定义',
 'beginTime':'预约开始时间原始值','endTime':'预约结束时间原始值','day':'预约日期原始值',
 'nameMerge':'预约场所完整名称','no':'座位/资源编号','statusName':'预约状态文字','status':'源状态码，依接口解释',
 'signInTime':'签到时间；读取不执行签到','renegeTime':'违约发生时间','createTime':'创建时间',
 'db_balance':'校园卡账面余额原始金额；未自动换算单位','cardBalance':'流水时点卡余额原始金额',
 'tranamt':'流水金额原始值','jndatetime':'流水发生时间','consumeType':'消费类型码','resume':'流水摘要',
 'account':'账户标识','sno':'学工号','departmentName':'院系/部门名称','professionName':'专业名称',
 'className':'班级名称','yhm':'ETA 当前用户名','xm':'ETA 当前姓名（依上下文）','bmmc':'ETA 部门名称',
 'jsList':'当前角色列表；不进行角色切换','modules':'个人信息模块目录','formCode':'动态表单编码',
 'extendCode':'动态表单扩展编码','bizCode':'业务编码','btnName':'模块显示名称',
 'zf':'研究生课程总分原始值','sjddBz':'研究生班级/学期标识','bjbh':'研究生教学班编号',
 'kcmc':'课程名称','cdmc':'上课场地名称','zc':'授课周次','jzgId':'教师标识','pkxq':'排课学期编码',
}


def note(endpoint,path):
    clean=path.replace('[]','').strip('.');key=clean.split('.')[-1]
    if endpoint.startswith('zdbk.') and key in ZDBK:return ZDBK[key],'business'
    if endpoint.startswith('sztz.'):
        if endpoint=='sztz.profile' and key=='xm':return '本人姓名','business'
        for k in sorted(PRACTICE,key=len,reverse=True):
            if clean==k or clean.endswith('.'+k):return PRACTICE[k],'business'
    if key in COMMON:return COMMON[key]
    if key in OTHER:return OTHER[key],'business'
    if 'queryModel' in clean or 'userModel' in clean:return '源接口框架子字段；完整保留，不用于学业计算','framework'
    return '源系统字段：用途未从当前证据确认，保留全部值，不参与推断','unverified'


def field_catalogue(endpoint,records):
    seen={}
    def walk(x,path=''):
        typ='null' if x is None else type(x).__name__
        entry=seen.setdefault(path or '$',{'types':set(),'description':note(endpoint,path)[0],'category':note(endpoint,path)[1]})
        entry['types'].add(typ)
        if isinstance(x,dict):
            for k,v in x.items():walk(v,path+'.'+k if path else k)
        elif isinstance(x,list):
            for v in x:walk(v,path+'[]')
    for record in records:walk(record)
    return {k:{**v,'types':sorted(v['types'])} for k,v in sorted(seen.items())}


def semantic_envelope(dataset):
    """For nonacademic endpoints, expose complete fields with contextual labels."""
    return {'endpoint':dataset['endpoint'],'source_complete':dataset['completeness']['complete'],
        'items':[{'fields':r,'source_ref':{'record_index':i,'pointer':dataset['record_refs'][i]}} for i,r in enumerate(dataset['records'])],
        'field_dictionary':field_catalogue(dataset['endpoint'],dataset['records']),
        'note':'Every field is retained. Unknown meanings are marked unverified rather than invented.'}
