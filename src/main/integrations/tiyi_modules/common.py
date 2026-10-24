"""Small shared contract; authentication and HTTP remain on Connection.

Each domain exports read(context, args) -> (payload, 'records'). A reader may
set context.connection.resource_coverage when the school paginates its reply.
No domain creates a network session or receives user-controlled URLs.
"""


class Failure(Exception):
    def __init__(self, code, message, status=None):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


class ModuleContext:
    def __init__(self, connection, module, row, url, body, page, headers, token_base):
        self.connection = connection
        self.module = module
        self.row = row
        self.url = url
        self.body = body
        self.page = page
        self.headers = headers
        self.token_base = token_base
