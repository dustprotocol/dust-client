import { environment } from '../../../environments/environment';
import { LogLevel } from './dev-util-log-level';

export class DevUtil {
  static devLog(
    msg: string,
    value?: any,
    logLevel: LogLevel = LogLevel.STD
  ): void {
    const minLogLevel = environment.logLevel;
    if (minLogLevel >= logLevel) {
      if (logLevel > LogLevel.WARNING) {
        console.log(msg, value);
      } else if (logLevel === LogLevel.WARNING) {
        console.warn(msg, value);
      } else if (logLevel === LogLevel.ERROR) {
        console.error(msg, value);
      }
    }
  }
}
