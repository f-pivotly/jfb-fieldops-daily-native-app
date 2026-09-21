export function metricValueKey(value, metricKeyById) {
  return value.metric_key || metricKeyById[value.metric_id] || null
}
