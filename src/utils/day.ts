import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

export const getCurrentDate = (tz: string = 'Asia/Kolkata') => {
	return dayjs().tz(tz).format('YYYY-MM-DD');
};
