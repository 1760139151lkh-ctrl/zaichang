"""School Tiyi readers, grouped by the service that owns the records."""


def read(context, args):
    resource = args['resource']
    if resource in ('study_records', 'counselling', 'counts', 'fitness_attendance'):
        from .study import read as reader
    elif resource in ('fitness', 'graduation_courses', 'graduation_report'):
        from .fitness import read as reader
    elif resource in ('teams', 'competitions', 'venue_entries', 'venue_live',
                      'feedback', 'westward', 'codoon'):
        from .community import read as reader
    else:
        from .common import Failure
        raise Failure('RESOURCE_NOT_FOUND', '没有找到这项体艺查询。')
    return reader(context, args)
