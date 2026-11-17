from enum import Enum


class ValueType(str, Enum):
    STRING = "string"
    NUMBER = "number"
    BOOLEAN = "boolean"
    NULL = "null"


PRIMITIVE_TYPES = frozenset(item.value for item in ValueType)
